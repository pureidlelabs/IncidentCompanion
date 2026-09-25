/**
 * An acceptance exists only for words a writer changed the document with, and
 * only until they are stored, so the prose role cannot be pointed at a record
 * nobody reaches any more.
 *
 * **The attack is the editor's own opening move.** Its answer to the server's
 * step 1 carries no content, and the reader leaves; then the case moves to a
 * customer nobody reaches and the application enters the prose role.
 */
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as encoding from 'lib0/encoding'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { writeSyncStep2 } from 'y-protocols/sync'
import * as Y from 'yjs'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { caseSocket, issued, pause } from './case-socket.js'
import { openTestPool } from './database.js'
import { cases, customers, proseAcceptances } from '../src/db/schema/index.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`
let harness: Harness
let admin: Persona
let owner: Persona
let writer: Persona
let seedPool: ReturnType<typeof openTestPool>
let appPool: ReturnType<typeof openTestPool>
let group = ''
let customer = ''
let nobody = ''
let caseId = ''
const sockets: WebSocket[] = []

const call = async (who: Persona, method: string, path: string, body?: unknown) => {
  const response = await fetch(`${harness.base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: who.cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  expect(response.ok, `${method} ${path} answered ${String(response.status)}: ${text}`).toBe(true)
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>
}

const { opens, types } = caseSocket(
  () => harness,
  () => caseId,
  sockets,
)
const seed = () => drizzle({ client: seedPool })

/** What the editor answers the server's opening step 1 with, holding nothing new. */
function answered(): string {
  const encoder = encoding.createEncoder()
  writeSyncStep2(encoder, new Y.Doc())
  return Buffer.from(encoding.toUint8Array(encoder)).toString('base64')
}

/** A note `writer` opened and answered without writing, and left, with what was recorded while it was open. */
async function openedAndLeft(): Promise<{ noteId: string; whileOpen: number }> {
  const noteId = (await call(owner, 'POST', `/api/cases/${caseId}/casenotes`, { note: 'seed' }))[
    'id'
  ] as string
  const live = await opens(writer, noteId)
  live.socket.send(
    JSON.stringify({
      type: 'prose.sync',
      field: `casenotes:${noteId}:document`,
      update: answered(),
    }),
  )
  await pause(500)
  const whileOpen = (
    await seed().select().from(proseAcceptances).where(eq(proseAcceptances.recordId, noteId))
  ).length
  live.socket.close()
  await pause(1_500)
  return { noteId, whileOpen }
}

describe.skipIf(!(await bootable()))('an acceptance', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')
    appPool = openTestPool(process.env['DATABASE_URL']!, 'ic_app')
    customer = (await call(admin, 'POST', '/api/customers', { name: `Accepted ${TAG}` }))[
      'id'
    ] as string
    nobody = (await call(admin, 'POST', '/api/customers', { name: `Nobody ${TAG}` }))[
      'id'
    ] as string
    group = (await call(admin, 'POST', '/api/groups', { name: `Accepted ${TAG}` }))['id'] as string
    await call(admin, 'POST', `/api/groups/${group}/customers`, { customerId: customer })
    owner = await issued(harness, admin, 'Owner', `acceptance-owner-${TAG}@example.invalid`)
    writer = await issued(harness, admin, 'Writer', `acceptance-writer-${TAG}@example.invalid`)
    for (const who of [owner, writer]) {
      await call(admin, 'POST', `/api/groups/${group}/members`, { userId: who.id, level: 'write' })
    }
    caseId = (await call(owner, 'POST', '/api/cases', { title: `Accepted ${TAG}` }))['id'] as string
    await call(owner, 'PUT', `/api/cases/${caseId}/customer`, { customerId: customer })
  }, 120_000)

  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    await pause(300)
    await seed().delete(cases).where(eq(cases.id, caseId))
    await seed().delete(customers).where(eq(customers.id, customer))
    await seed().delete(customers).where(eq(customers.id, nobody))
    await seedPool.end()
    await appPool.end()
    await harness.close()
  })

  it('is not recorded for a frame that adds nothing, nor left behind when the writer leaves', async () => {
    const { noteId, whileOpen } = await openedAndLeft()
    const left = await seed()
      .select()
      .from(proseAcceptances)
      .where(eq(proseAcceptances.recordId, noteId))

    expect({ whileOpen, left: left.length }).toEqual({ whileOpen: 0, left: 0 })
  })

  it('is removed once the words it was for are stored', async () => {
    const noteId = (await call(owner, 'POST', `/api/cases/${caseId}/casenotes`, { note: 'seed' }))[
      'id'
    ] as string
    const watching = await opens(owner, noteId)
    const live = await opens(writer, noteId)
    await types(live, noteId, `stored words ${TAG}`, watching)
    const recorded = await seed()
      .select()
      .from(proseAcceptances)
      .where(eq(proseAcceptances.recordId, noteId))
    await pause(1_500)

    expect({
      recorded: recorded.length,
      left: (
        await seed().select().from(proseAcceptances).where(eq(proseAcceptances.recordId, noteId))
      ).length,
    }).toEqual({ recorded: 1, left: 0 })
  })

  it('lets the prose role write nothing into a note whose case has since moved out of every reach', async () => {
    const { noteId } = await openedAndLeft()
    await seed().update(cases).set({ customerId: nobody }).where(eq(cases.id, caseId))
    let touched: number | string
    try {
      touched = await drizzle({ client: appPool })
        .transaction(async (tx) => {
          await tx.execute(sql`set local role ic_prose`)
          await tx.execute(
            sql`select set_config('app.case_id', ${caseId}, true), set_config('app.prose_record', ${noteId}, true), set_config('app.principal', '', true)`,
          )
          const answer = await tx.execute(
            sql`update casenotes set note = 'written by nobody who reaches it', updated_by = ${writer.id} where id = ${noteId}`,
          )
          return answer.rowCount ?? 0
        })
        .catch((error: unknown) => {
          const cause = (error as { cause?: { code?: string } }).cause
          return cause?.code ?? String(error)
        })
    } finally {
      await seed().update(cases).set({ customerId: customer }).where(eq(cases.id, caseId))
    }

    expect(touched).not.toBe(1)
  })
})

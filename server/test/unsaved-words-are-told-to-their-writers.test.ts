/**
 * Analysts holding a note whose words the install cannot store are told so
 * while they can still act on it, told again when the words are stored, and
 * told when the words can no longer be stored.
 *
 * **The store refuses by its audit**: a trigger refuses every audit line for
 * the note, so every save of it fails until the trigger is lifted.
 */
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { asked, caseSocket, issued, pause, until, type Live } from './case-socket.js'
import { openTestPool } from './database.js'
import { cases, customers } from '../src/db/schema/index.js'
import { ACCEPTANCE_LASTS } from '../src/db/schema/scoped.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`
let harness: Harness
let admin: Persona
let owner: Persona
let writer: Persona
let seedPool: ReturnType<typeof openTestPool>
let ownerPool: ReturnType<typeof openTestPool>
let customer = ''
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

const aNote = async (note: string) =>
  (await call(owner, 'POST', `/api/cases/${caseId}/casenotes`, { note }))['id'] as string

/** The states `live` has been told for `noteId`, in order. */
const told = (live: Live, noteId: string) =>
  live.heard
    .filter((frame) => frame.type === 'prose.state' && frame['field'] === `casenotes:${noteId}:document`)
    .map((frame) => frame['state'])

/** The audit refuses every line for `noteId` until the returned function lifts it. */
async function refuseTheAuditOf(noteId: string) {
  const asOwner = drizzle({ client: ownerPool })
  const name = `refuse_${noteId.replaceAll('-', '_')}`
  await asOwner.execute(
    sql.raw(
      `create or replace function ${name}() returns trigger language plpgsql as $f$ begin if new.detail->>'record' = '${noteId}' then raise exception 'the audit refuses this line'; end if; return new; end $f$`,
    ),
  )
  await asOwner.execute(
    sql.raw(`create trigger ${name} before insert on install_activity for each row execute function ${name}()`),
  )
  return async () => {
    await asOwner.execute(sql.raw(`drop trigger if exists ${name} on install_activity`))
    await asOwner.execute(sql.raw(`drop function if exists ${name}()`))
  }
}

describe.skipIf(!(await bootable()))('words the install holds unsaved', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')
    ownerPool = openTestPool(process.env['TEST_DATABASE_URL']!)
    customer = (await call(admin, 'POST', '/api/customers', { name: `Unsaved ${TAG}` }))['id'] as string
    const group = (await call(admin, 'POST', '/api/groups', { name: `Unsaved ${TAG}` }))['id'] as string
    await call(admin, 'POST', `/api/groups/${group}/customers`, { customerId: customer })
    owner = await issued(harness, admin, 'Owner', `unsaved-owner-${TAG}@example.invalid`)
    writer = await issued(harness, admin, 'Writer', `unsaved-writer-${TAG}@example.invalid`)
    for (const who of [owner, writer]) {
      await call(admin, 'POST', `/api/groups/${group}/members`, { userId: who.id, level: 'write' })
    }
    caseId = (await call(owner, 'POST', '/api/cases', { title: `Unsaved ${TAG}` }))['id'] as string
    await call(owner, 'PUT', `/api/cases/${caseId}/customer`, { customerId: customer })
  }, 120_000)

  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    await pause(300)
    const seed = drizzle({ client: seedPool })
    await seed.delete(cases).where(eq(cases.id, caseId))
    await seed.delete(customers).where(eq(customers.id, customer))
    await seedPool.end()
    await ownerPool.end()
    await harness.close()
  })

  it('tells every analyst holding the note that its words are unsaved, lets them go on writing, and tells them once they are saved', async () => {
    const noteId = await aNote('unsaved')
    const one = await opens(owner, noteId)
    const two = await opens(writer, noteId)
    const lift = await refuseTheAuditOf(noteId)
    try {
      await types(two, noteId, `refused ${TAG}`, one)
      await until(() => told(one, noteId).includes('unsaved') && told(two, noteId).includes('unsaved'), 'nobody was told the words are unsaved', 5_000)

      // Nothing is locked: both still write, and neither is refused.
      await types(one, noteId, ` and more ${TAG}`, two)
      await types(two, noteId, ` still ${TAG}`, one)
      expect([...one.heard, ...two.heard].some((frame) => frame.type === 'prose.refused')).toBe(false)
    } finally {
      await lift()
    }

    await types(two, noteId, ` stored ${TAG}`, one)
    await until(() => told(one, noteId).at(-1) === 'saved' && told(two, noteId).at(-1) === 'saved', 'nobody was told the words are saved', 5_000)
  }, 30_000)

  it('tells a screen opening the note while its words are unsaved', async () => {
    const noteId = await aNote('reopened')
    const one = await opens(owner, noteId)
    const two = await opens(writer, noteId)
    const lift = await refuseTheAuditOf(noteId)
    try {
      await types(one, noteId, `refused ${TAG}`, two)
      await until(() => told(one, noteId).includes('unsaved'), 'the writer was never told', 5_000)

      const arriving = await opens(writer, noteId)
      await until(() => told(arriving, noteId).includes('unsaved'), 'a connection opening it was not told')

      // The same connection opening it again, as a screen mounted afresh does.
      const before = told(one, noteId).length
      one.socket.send(JSON.stringify({ type: 'prose.sync', field: `casenotes:${noteId}:document`, update: asked() }))
      await until(() => told(one, noteId).length > before, 'a screen opening it again was not told')
    } finally {
      await lift()
    }
  }, 30_000)

  it('tells the analysts holding the note once its words can no longer be stored', async () => {
    const noteId = await aNote('lapsing')
    const one = await opens(owner, noteId)
    const two = await opens(writer, noteId)
    const lift = await refuseTheAuditOf(noteId)
    try {
      await types(two, noteId, `refused ${TAG}`, one)
      await until(() => told(one, noteId).includes('unsaved'), 'the writers were never told the words are unsaved', 5_000)
      expect(told(one, noteId)).not.toContain('lost')

      // The store refused for longer than an acceptance lasts.
      await drizzle({ client: ownerPool }).execute(
        sql`update prose_acceptances set accepted_at = now() - ${ACCEPTANCE_LASTS}::interval - interval '1 minute' where record_id = ${noteId}`,
      )
      await types(two, noteId, ` after ${TAG}`, one)
      await until(() => told(one, noteId).at(-1) === 'lost' && told(two, noteId).at(-1) === 'lost', 'nobody was told the words are given up', 5_000)
    } finally {
      await lift()
    }
  }, 30_000)
})

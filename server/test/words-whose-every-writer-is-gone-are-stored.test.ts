/**
 * Words whose every writer's account is gone before they are stored are stored
 * by the install, naming nobody; words by a writer who still has an account
 * are not stored that way.
 *
 * > #### Scenario: Every writer's account is gone before the words are stored
 * > #### Scenario: The only writer loses write before the words are stored
 *
 * **The attack is a deletion inside the quiet moment**, and each case leaves
 * the save to a different path: the quiet moment itself, the socket closing,
 * and the process shutting down. The boundary cases take the same paths with a
 * writer whose account remains.
 */
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { caseSocket, issued, pause, typed, until } from './case-socket.js'
import { openTestPool } from './database.js'
import { caseNotes, cases, changeFeed, customers, user } from '../src/db/schema/index.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`

let harness: Harness | undefined
let admin: Persona
let owner: Persona
let seedPool: ReturnType<typeof openTestPool>
let group = ''
let customer = ''
let caseId = ''
const sockets: WebSocket[] = []

const call = async (who: Persona, method: string, path: string, body?: unknown) => {
  const response = await fetch(`${harness!.base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: who.cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  expect(response.ok, `${method} ${path} answered ${String(response.status)}: ${text}`).toBe(true)
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>
}

let count = 0
/** An analyst the administrator issues, at `level` on the case's customer. */
async function anAnalyst(level: 'read' | 'write'): Promise<Persona> {
  count += 1
  const who = await issued(
    harness!,
    admin,
    `Writer ${String(count)}`,
    `gone-writer-${String(count)}-${TAG}@example.invalid`,
  )
  await call(admin, 'POST', `/api/groups/${group}/members`, { userId: who.id, level })
  return who
}

const { opens, types } = caseSocket(
  () => harness!,
  () => caseId,
  sockets,
)

const seed = () => drizzle({ client: seedPool })

async function aNote(): Promise<string> {
  return (await call(owner, 'POST', `/api/cases/${caseId}/casenotes`, { note: 'seed' }))[
    'id'
  ] as string
}

async function stored(noteId: string) {
  const [row] = await seed()
    .select({ note: caseNotes.note, updatedBy: caseNotes.updatedBy })
    .from(caseNotes)
    .where(eq(caseNotes.id, noteId))
  const feed = await seed()
    .select({ actorId: changeFeed.actorId })
    .from(changeFeed)
    .where(and(eq(changeFeed.entity, 'casenotes'), eq(changeFeed.entityId, noteId)))
    .orderBy(changeFeed.seq)
  return { note: row!.note, updatedBy: row!.updatedBy, lastActor: feed.at(-1)?.actorId }
}

const gone = (who: Persona) => seed().delete(user).where(eq(user.id, who.id))
const lowered = (who: Persona) =>
  call(admin, 'POST', `/api/groups/${group}/members`, { userId: who.id, level: 'read' })

describe.skipIf(!(await bootable()))('words whose writers are gone before they are stored', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')
    customer = (await call(admin, 'POST', '/api/customers', { name: `Gone writers ${TAG}` }))[
      'id'
    ] as string
    group = (await call(admin, 'POST', '/api/groups', { name: `Gone writers ${TAG}` }))[
      'id'
    ] as string
    await call(admin, 'POST', `/api/groups/${group}/customers`, { customerId: customer })
    owner = await anAnalyst('write')
    caseId = (await call(owner, 'POST', '/api/cases', { title: `Gone writers ${TAG}` }))[
      'id'
    ] as string
    await call(owner, 'PUT', `/api/cases/${caseId}/customer`, { customerId: customer })
  }, 120_000)

  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    await pause(300)
    await seed().delete(cases).where(eq(cases.id, caseId))
    await seed().delete(customers).where(eq(customers.id, customer))
    await seedPool?.end()
    await harness?.close()
  })

  it('stores them on the quiet moment, naming nobody', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    await types(
      await opens(writer, noteId),
      noteId,
      `alone and gone before the quiet moment ${TAG}`,
      watching,
    )
    await gone(writer)
    expect((await stored(noteId)).note, 'stored before the deletion, so this proves nothing').toBe(
      'seed',
    )

    await pause(1_500)

    expect(await stored(noteId)).toEqual({
      note: expect.stringContaining(`alone and gone before the quiet moment ${TAG}`),
      updatedBy: null,
      lastActor: null,
    })
  })

  it('stores them when the last reader leaves, naming nobody', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const live = await opens(writer, noteId)
    await types(live, noteId, `alone and gone before the close ${TAG}`, watching)
    await gone(writer)
    live.socket.close()
    watching.socket.close()
    await pause(1_500)

    expect(await stored(noteId)).toEqual({
      note: expect.stringContaining(`alone and gone before the close ${TAG}`),
      updatedBy: null,
      lastActor: null,
    })
  })

  it('does not store words whose only writer lost write and still has an account', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const live = await opens(writer, noteId)
    await types(live, noteId, `lost write ${TAG}`, watching)
    await lowered(writer)
    live.socket.close()
    watching.socket.close()
    await pause(1_500)

    expect((await stored(noteId)).note).toBe('seed')
  })

  it('does not store words where one writer is gone and the other lost write', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const [one, two] = [await anAnalyst('write'), await anAnalyst('write')]
    const first = await opens(one, noteId)
    const second = await opens(two, noteId)
    await types(first, noteId, `from the one who goes ${TAG}`, watching)
    await types(second, noteId, `from the one who stays ${TAG}`, watching)
    await gone(one)
    await lowered(two)
    for (const live of [first, second, watching]) live.socket.close()
    await pause(1_500)

    expect((await stored(noteId)).note).toBe('seed')
  })

  it('does not store words a reader sent and the case refused, once the reader is gone', async () => {
    const noteId = await aNote()
    const reader = await anAnalyst('read')
    const live = await opens(reader, noteId)
    live.socket.send(
      JSON.stringify({
        type: 'prose.sync',
        field: `casenotes:${noteId}:document`,
        update: typed(`never written ${TAG}`),
      }),
    )
    await until(
      () => live.heard.some((f) => f.type === 'prose.refused'),
      'the words were never refused',
    )
    await gone(reader)
    live.socket.close()
    await pause(1_500)

    expect((await stored(noteId)).note).toBe('seed')
  })

  // Last: it shuts the application down.
  it('stores them as the application shuts down, naming nobody', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    await types(
      await opens(writer, noteId),
      noteId,
      `alone and gone before the shutdown ${TAG}`,
      watching,
    )
    await gone(writer)
    await harness!.close()
    harness = undefined

    expect(await stored(noteId)).toEqual({
      note: expect.stringContaining(`alone and gone before the shutdown ${TAG}`),
      updatedBy: null,
      lastActor: null,
    })
  }, 30_000)
})

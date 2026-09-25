/**
 * Words the application accepted from an analyst who could write at that
 * moment are stored and named for them, whether or not they can still write
 * when the words are stored; a word sent after they can no longer write is
 * refused and never stored; and words land only in the record, and the case,
 * they were addressed to.
 *
 * **The attack is a withdrawal inside the quiet moment**: write lowered to
 * read, or the account disabled, after the words were taken and before they
 * are stored. Each case leaves the save to a different path: the quiet moment
 * itself, the last reader leaving, and the process shutting down.
 */
import { and, eq, like, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { asked, caseSocket, issued, pause, typed, until } from './case-socket.js'
import { openTestPool } from './database.js'
import {
  caseNotes,
  cases,
  changeFeed,
  customers,
  installActivity,
  user,
} from '../src/db/schema/index.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`

let harness: Harness | undefined
let admin: Persona
let owner: Persona
let seedPool: ReturnType<typeof openTestPool>
let group = ''
let customer = ''
let caseId = ''
let otherCase = ''
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
    `kept-writer-${String(count)}-${TAG}@example.invalid`,
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
  const audit = await seed()
    .select({ label: installActivity.actorLabel })
    .from(installActivity)
    .where(
      and(
        sql`${installActivity.detail}->>'record' = ${noteId}`,
        like(installActivity.targetLabel, 'live prose.sync%'),
      ),
    )
  return {
    note: row!.note,
    updatedBy: row!.updatedBy,
    lastActor: feed.at(-1)?.actorId,
    audit: audit.map((line) => line.label),
  }
}

const lowered = (who: Persona) =>
  call(admin, 'POST', `/api/groups/${group}/members`, { userId: who.id, level: 'read' })

/** What `who` should be recorded as having stored in `noteId`. */
const namedFor = (who: Persona, words: string, label: string) => ({
  note: expect.stringContaining(words),
  updatedBy: who.id,
  lastActor: who.id,
  audit: [label],
})

const disabled = (who: Persona) =>
  call(admin, 'POST', `/api/accounts/${encodeURIComponent(who.email)}/disable`)

describe.skipIf(!(await bootable()))('words accepted before their writer loses write', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')
    customer = (await call(admin, 'POST', '/api/customers', { name: `Kept words ${TAG}` }))[
      'id'
    ] as string
    group = (await call(admin, 'POST', '/api/groups', { name: `Kept words ${TAG}` }))[
      'id'
    ] as string
    await call(admin, 'POST', `/api/groups/${group}/customers`, { customerId: customer })
    owner = await anAnalyst('write')
    caseId = (await call(owner, 'POST', '/api/cases', { title: `Kept words ${TAG}` }))[
      'id'
    ] as string
    await call(owner, 'PUT', `/api/cases/${caseId}/customer`, { customerId: customer })
  }, 120_000)

  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    await pause(300)
    await seed().delete(cases).where(eq(cases.id, caseId))
    if (otherCase) await seed().delete(cases).where(eq(cases.id, otherCase))
    await seed().delete(customers).where(eq(customers.id, customer))
    await seedPool?.end()
    await harness?.close()
  })

  it('stores what the only writer typed before losing write, on the quiet moment, named for them', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const words = `typed before losing write ${TAG}`
    await types(await opens(writer, noteId), noteId, words, watching)
    await lowered(writer)
    expect(
      (await stored(noteId)).note,
      'stored before the withdrawal, so this proves nothing',
    ).toBe('seed')

    await pause(1_500)

    expect(await stored(noteId)).toEqual(namedFor(writer, words, `Writer ${String(count)}`))
  })

  it('stores what the only writer typed before losing write when the last reader leaves, named for them', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const live = await opens(writer, noteId)
    const words = `typed before losing write and leaving ${TAG}`
    await types(live, noteId, words, watching)
    await lowered(writer)
    live.socket.close()
    watching.socket.close()
    await pause(1_500)

    expect(await stored(noteId)).toEqual(namedFor(writer, words, `Writer ${String(count)}`))
  })

  it('stores what a writer typed before their account was disabled, named for them', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const words = `typed before being disabled ${TAG}`
    await types(await opens(writer, noteId), noteId, words, watching)
    await disabled(writer)
    watching.socket.close()
    await pause(1_500)

    expect(await stored(noteId)).toEqual(namedFor(writer, words, `Writer ${String(count)}`))
  })

  it('refuses a word sent after write is withdrawn, and never stores it', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const live = await opens(writer, noteId)
    await types(live, noteId, `taken ${TAG}`, watching)
    await lowered(writer)
    live.socket.send(
      JSON.stringify({
        type: 'prose.sync',
        field: `casenotes:${noteId}:document`,
        update: typed(`sent after the withdrawal ${TAG}`),
      }),
    )
    await until(
      () => live.heard.some((f) => f.type === 'prose.refused'),
      'the late word was not refused',
    )
    live.socket.close()
    watching.socket.close()
    await pause(1_500)

    const note = (await stored(noteId)).note
    expect({
      taken: note.includes(`taken ${TAG}`),
      late: note.includes(`sent after the withdrawal ${TAG}`),
    }).toEqual({
      taken: true,
      late: false,
    })
  })

  it('stores nothing into a record of another case the words were addressed to', async () => {
    otherCase = (await call(owner, 'POST', '/api/cases', { title: `Another case ${TAG}` }))[
      'id'
    ] as string
    const elsewhere = (
      await call(owner, 'POST', `/api/cases/${otherCase}/casenotes`, { note: 'seed' })
    )['id'] as string
    const noteId = await aNote()
    const live = await opens(owner, noteId)
    for (const update of [asked(), typed(`addressed elsewhere ${TAG}`)]) {
      live.socket.send(
        JSON.stringify({ type: 'prose.sync', field: `casenotes:${elsewhere}:document`, update }),
      )
    }
    await pause(200)
    live.socket.close()
    await pause(1_500)

    expect((await stored(elsewhere)).note).toBe('seed')
  })

  it('stores what a writer whose account row is gone typed, naming nobody', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const words = `typed by an account removed underneath ${TAG}`
    await types(await opens(writer, noteId), noteId, words, watching)
    await seed().delete(user).where(eq(user.id, writer.id))
    await pause(1_500)

    expect(await stored(noteId)).toEqual({
      note: expect.stringContaining(words),
      updatedBy: null,
      lastActor: null,
      audit: [`Writer ${String(count)}`],
    })
  })

  // Last: it shuts the application down.
  it('stores what the only writer typed before losing write as the application shuts down, named for them', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const words = `typed before losing write and the shutdown ${TAG}`
    await types(await opens(writer, noteId), noteId, words, watching)
    await lowered(writer)
    await harness!.close()
    harness = undefined

    expect(await stored(noteId)).toEqual(namedFor(writer, words, `Writer ${String(count)}`))
  }, 30_000)
})

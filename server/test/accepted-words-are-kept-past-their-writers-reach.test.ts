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
import { ACCEPTANCE_LASTS } from '../src/db/schema/scoped.js'
import {
  caseNotes,
  cases,
  changeFeed,
  customers,
  installActivity,
  proseAcceptances,
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

  it('ends a disabled writer\'s connection, refuses what they send after, and keeps what came before, named for them', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const live = await opens(writer, noteId)
    const closed = new Promise<void>((done) => live.socket.once('close', () => done()))
    const words = `typed before being disabled ${TAG}`
    await types(live, noteId, words, watching)
    await disabled(writer)
    live.socket.send(
      JSON.stringify({
        type: 'prose.sync',
        field: `casenotes:${noteId}:document`,
        update: typed(`sent after being disabled ${TAG}`),
      }),
    )
    await closed
    watching.socket.close()
    await pause(1_500)

    const after = await stored(noteId)
    expect({ ...after, late: after.note.includes(`sent after being disabled ${TAG}`) }).toEqual({
      ...namedFor(writer, words, `Writer ${String(count)}`),
      late: false,
    })
  })

  it('keeps words whose audit line the store refuses unstored, and stores them with it once it can', async () => {
    const owners = openTestPool(process.env['TEST_DATABASE_URL']!)
    const asOwner = drizzle({ client: owners })
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const live = await opens(writer, noteId)
    const words = `typed while the audit refuses ${TAG}`
    const refusal = `refuse_the_audit_${String(process.pid)}`
    await asOwner.execute(
      sql.raw(
        `create or replace function ${refusal}() returns trigger language plpgsql as $f$ begin if new.actor_id = '${writer.id}' then raise exception 'the audit refuses this line'; end if; return new; end $f$`,
      ),
    )
    await asOwner.execute(
      sql.raw(`create trigger ${refusal} before insert on install_activity for each row execute function ${refusal}()`),
    )
    let refused: Awaited<ReturnType<typeof stored>>
    try {
      await types(live, noteId, words, watching)
      await pause(1_500)
      refused = await stored(noteId)
    } finally {
      await asOwner.execute(sql.raw(`drop trigger ${refusal} on install_activity`))
      await asOwner.execute(sql.raw(`drop function ${refusal}()`))
      await owners.end()
    }
    live.socket.close()
    watching.socket.close()
    await pause(1_500)

    expect({ refused: refused.note, after: await stored(noteId) }).toEqual({
      refused: 'seed',
      after: namedFor(writer, words, `Writer ${String(count)}`),
    })
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

  /**
   * The audit refuses every line for `noteId` until the returned function lifts it, so each save
   * of it fails and the document stays held.
   */
  async function refuseTheAuditOf(asOwner: ReturnType<typeof drizzle>, noteId: string, name: string) {
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

  /** Ages `noteId`'s acceptances to three seconds short of lapsing, further than a held one gets between refreshes. */
  const nearlyLapsed = (asOwner: ReturnType<typeof drizzle>, noteId: string) =>
    asOwner.execute(
      sql`update prose_acceptances set accepted_at = now() - ${ACCEPTANCE_LASTS}::interval + interval '3 seconds' where record_id = ${noteId}`,
    )

  /** How many acceptances `noteId` holds, and how many of them were refreshed in the last minute. */
  async function acceptancesOf(noteId: string) {
    const rows = await seed()
      .select({ fresh: sql<boolean>`${proseAcceptances.acceptedAt} > now() - interval '1 minute'` })
      .from(proseAcceptances)
      .where(eq(proseAcceptances.recordId, noteId))
    return { held: rows.length, fresh: rows.filter((one) => one.fresh).length }
  }

  it('keeps a failing document\'s acceptances refreshed, one per writer, for as long as it is held, and stores its words once the store recovers', async () => {
    const owners = openTestPool(process.env['TEST_DATABASE_URL']!)
    const asOwner = drizzle({ client: owners })
    const noteId = await aNote()
    const elsewhere = await aNote()
    const watching = await opens(owner, noteId)
    const writer = await anAnalyst('write')
    const live = await opens(writer, noteId)
    // Another record's acceptance, current but not fresh, which no refresh of this document may touch.
    await seed()
      .insert(proseAcceptances)
      .values({
        caseId,
        entity: 'casenotes',
        recordId: elsewhere,
        writerId: writer.id,
        acceptedAt: sql`now() - interval '30 minutes'`,
      })
    const lift = await refuseTheAuditOf(asOwner, noteId, `refuse_the_audit_held_${String(process.pid)}`)
    const whileFailing: { held: number; fresh: number }[] = []
    try {
      await types(live, noteId, `held words 0 ${TAG}`, watching)
      await pause(1_500)
      for (const round of [1, 2, 3]) {
        await nearlyLapsed(asOwner, noteId)
        await types(live, noteId, `held words ${String(round)} ${TAG}`, watching)
        await pause(1_500)
        whileFailing.push(await acceptancesOf(noteId))
      }
    } finally {
      await lift()
      await owners.end()
    }
    await types(live, noteId, `after the recovery ${TAG}`, watching)
    await pause(1_500)
    live.socket.close()
    watching.socket.close()
    await pause(1_500)

    const after = await stored(noteId)
    expect({
      whileFailing,
      elsewhere: await acceptancesOf(elsewhere),
      words: [0, 1, 2, 3].every((round) => after.note.includes(`held words ${String(round)} ${TAG}`)),
      updatedBy: after.updatedBy,
      left: await acceptancesOf(noteId),
    }).toEqual({
      whileFailing: [1, 2, 3].map(() => ({ held: 1, fresh: 1 })),
      elsewhere: { held: 1, fresh: 0 },
      words: true,
      updatedBy: writer.id,
      left: { held: 0, fresh: 0 },
    })
    await seed().delete(proseAcceptances).where(eq(proseAcceptances.recordId, elsewhere))
  }, 40_000)

  it('stores what every writer typed into a failing document once the store recovers, though one of them has since lost write', async () => {
    const owners = openTestPool(process.env['TEST_DATABASE_URL']!)
    const asOwner = drizzle({ client: owners })
    const noteId = await aNote()
    const staying = await anAnalyst('write')
    const leaving = await anAnalyst('write')
    const one = await opens(staying, noteId)
    const two = await opens(leaving, noteId)
    const lift = await refuseTheAuditOf(asOwner, noteId, `refuse_the_audit_two_${String(process.pid)}`)
    try {
      await types(two, noteId, `from the one who loses write ${TAG}`, one)
      await types(one, noteId, `from the one who stays ${TAG}`, two)
      await pause(1_500)
      await nearlyLapsed(asOwner, noteId)
      await lowered(leaving)
      await types(one, noteId, `more from the one who stays ${TAG}`, two)
      // Past the moment an acceptance nobody refreshed would have lapsed.
      await pause(3_500)
    } finally {
      await lift()
      await owners.end()
    }
    await types(one, noteId, `after the recovery ${TAG}`, two)
    await pause(1_500)
    one.socket.close()
    two.socket.close()
    await pause(1_500)

    const after = await stored(noteId)
    expect({
      words: [
        `from the one who loses write ${TAG}`,
        `from the one who stays ${TAG}`,
        `after the recovery ${TAG}`,
      ].every((words) => after.note.includes(words)),
      updatedBy: after.updatedBy,
      audit: [...after.audit].sort(),
    }).toEqual({
      words: true,
      updatedBy: staying.id,
      audit: [`Writer ${String(count - 1)}`, `Writer ${String(count)}`].sort(),
    })
  }, 40_000)

  it('names the writer who wrote last on the record', async () => {
    const noteId = await aNote()
    const watching = await opens(owner, noteId)
    const first = await anAnalyst('write')
    const last = await anAnalyst('write')
    await types(await opens(first, noteId), noteId, `typed first ${TAG}`, watching)
    await types(await opens(last, noteId), noteId, `typed last ${TAG}`, watching)
    await pause(1_500)

    expect((await stored(noteId)).updatedBy).toBe(last.id)
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

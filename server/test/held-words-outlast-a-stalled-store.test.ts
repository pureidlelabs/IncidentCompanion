/**
 * Words a document holds stay storable while the store stalls, whether a save
 * waits on a lock, the store refuses the save and its refresh, or frames keep
 * arriving too quickly for a quiet moment; and a document whose record is gone
 * stops holding anything for it.
 *
 * **Each attack stands in a long stall of the store** by ageing the document's
 * acceptances, an hour or to within seconds of lapsing, rather than waiting.
 */
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { caseSocket, issued, pause } from './case-socket.js'
import { openTestPool } from './database.js'
import { caseNotes, cases, customers, proseAcceptances } from '../src/db/schema/index.js'
import { ACCEPTANCE_LASTS } from '../src/db/schema/scoped.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`
let harness: Harness
let admin: Persona
let owner: Persona
let writer: Persona
let seedPool: ReturnType<typeof openTestPool>
let group = ''
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
const seed = () => drizzle({ client: seedPool })

const aNote = async (note: string) =>
  (await call(owner, 'POST', `/api/cases/${caseId}/casenotes`, { note }))['id'] as string

const noteOf = async (noteId: string) =>
  (await seed().select({ note: caseNotes.note }).from(caseNotes).where(eq(caseNotes.id, noteId)))[0]
    ?.note ?? ''

const acceptancesOf = async (noteId: string) =>
  (await seed().select().from(proseAcceptances).where(eq(proseAcceptances.recordId, noteId))).length

/** The audit refuses every line for `noteId` until the returned function lifts it. */
async function refuseTheAuditOf(asOwner: ReturnType<typeof drizzle>, noteId: string, name: string) {
  await asOwner.execute(
    sql.raw(
      `create or replace function ${name}() returns trigger language plpgsql as $f$ begin if new.detail->>'record' = '${noteId}' then raise exception 'the audit refuses this line'; end if; return new; end $f$`,
    ),
  )
  await asOwner.execute(
    sql.raw(
      `create trigger ${name} before insert on install_activity for each row execute function ${name}()`,
    ),
  )
  return async () => {
    await asOwner.execute(sql.raw(`drop trigger if exists ${name} on install_activity`))
    await asOwner.execute(sql.raw(`drop function if exists ${name}()`))
  }
}

/** Ages `noteId`'s acceptances by an hour: the store stalling that long. */
const anHourPasses = (asOwner: ReturnType<typeof drizzle>, noteId: string) =>
  asOwner.execute(
    sql`update prose_acceptances set accepted_at = accepted_at - interval '61 minutes' where record_id = ${noteId}`,
  )

describe.skipIf(!(await bootable()))('words held while the store stalls', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')
    customer = (await call(admin, 'POST', '/api/customers', { name: `Stalled ${TAG}` }))[
      'id'
    ] as string
    group = (await call(admin, 'POST', '/api/groups', { name: `Stalled ${TAG}` }))['id'] as string
    await call(admin, 'POST', `/api/groups/${group}/customers`, { customerId: customer })
    owner = await issued(harness, admin, 'Owner', `stalled-owner-${TAG}@example.invalid`)
    writer = await issued(harness, admin, 'Writer', `stalled-writer-${TAG}@example.invalid`)
    for (const who of [owner, writer]) {
      await call(admin, 'POST', `/api/groups/${group}/members`, { userId: who.id, level: 'write' })
    }
    caseId = (await call(owner, 'POST', '/api/cases', { title: `Stalled ${TAG}` }))['id'] as string
    await call(owner, 'PUT', `/api/cases/${caseId}/customer`, { customerId: customer })
  }, 120_000)

  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    await pause(300)
    await seed().delete(cases).where(eq(cases.id, caseId))
    await seed().delete(customers).where(eq(customers.id, customer))
    await seedPool.end()
    await harness.close()
  })

  it('stores what a stream of frames wrote while the stream is still going', async () => {
    const noteId = await aNote('stream')
    const one = await opens(owner, noteId)
    const two = await opens(writer, noteId)
    const start = Date.now()
    for (let frame = 0; Date.now() - start < 8_000; frame += 1) {
      await types(frame % 2 ? one : two, noteId, `S${String(frame)} `, frame % 2 ? two : one)
      await pause(300)
    }

    expect(await noteOf(noteId), 'nothing was stored while frames kept arriving').not.toBe('stream')
  }, 30_000)

  it('stores what was written while its first save waited on a lock for longer than an acceptance lasts', async () => {
    const owners = openTestPool(process.env['TEST_DATABASE_URL']!)
    const asOwner = drizzle({ client: owners })
    const noteId = await aNote('hang')
    const one = await opens(owner, noteId)
    const two = await opens(writer, noteId)
    const locker = await owners.connect()
    await locker.query('begin')
    await locker.query('select 1 from casenotes where id = $1 for update', [noteId])
    try {
      await types(two, noteId, `hung ${TAG}`, one)
      await pause(1_500)
      // Ten seconds from lapsing, and held past that: only a save that gives up in time can keep it.
      await asOwner.execute(
        sql`update prose_acceptances set accepted_at = now() - ${ACCEPTANCE_LASTS}::interval + interval '10 seconds' where record_id = ${noteId}`,
      )
      await pause(12_000)
      // A save that waited on the lock gave up in time, and its failure kept the acceptance current.
      const [held] = await seed()
        .select({
          fresh: sql<boolean>`${proseAcceptances.acceptedAt} > now() - interval '1 minute'`,
        })
        .from(proseAcceptances)
        .where(eq(proseAcceptances.recordId, noteId))
      expect(held?.fresh, 'the save that waited on the lock never gave up').toBe(true)
    } finally {
      await locker.query('commit')
      locker.release()
    }
    await types(two, noteId, `later from the writer ${TAG}`, one)
    await types(one, noteId, `later from the owner ${TAG}`, two)
    await pause(1_500)
    one.socket.close()
    two.socket.close()
    await pause(1_500)
    await owners.end()

    const note = await noteOf(noteId)
    expect(
      [`hung ${TAG}`, `later from the writer ${TAG}`, `later from the owner ${TAG}`].every(
        (words) => note.includes(words),
      ),
    ).toBe(true)
  }, 60_000)

  it('stores what was written while the store refused the save and its refresh for an hour', async () => {
    const owners = openTestPool(process.env['TEST_DATABASE_URL']!)
    const asOwner = drizzle({ client: owners })
    const noteId = await aNote('outage')
    const one = await opens(owner, noteId)
    const two = await opens(writer, noteId)
    const lift = await refuseTheAuditOf(asOwner, noteId, `refuse_the_outage_${String(process.pid)}`)
    await asOwner.execute(sql.raw('revoke update on prose_acceptances from ic_prose'))
    try {
      await types(two, noteId, `during the outage ${TAG}`, one)
      await pause(1_500)
      await anHourPasses(asOwner, noteId)
      await types(one, noteId, `more during the outage ${TAG}`, two)
      await pause(1_500)
    } finally {
      await asOwner.execute(sql.raw('grant update (accepted_at) on prose_acceptances to ic_prose'))
      await lift()
    }
    await types(one, noteId, `after the outage ${TAG}`, two)
    await pause(1_500)
    one.socket.close()
    two.socket.close()
    await pause(1_500)
    await owners.end()

    const note = await noteOf(noteId)
    expect(
      [
        `during the outage ${TAG}`,
        `more during the outage ${TAG}`,
        `after the outage ${TAG}`,
      ].every((words) => note.includes(words)),
    ).toBe(true)
  }, 40_000)

  it('stops holding acceptances for a note that is gone', async () => {
    const noteId = await aNote('gone')
    const one = await opens(owner, noteId)
    const two = await opens(writer, noteId)
    await seed().delete(caseNotes).where(eq(caseNotes.id, noteId))
    await types(two, noteId, `into a note that is gone ${TAG}`, one)
    await pause(1_500)

    expect(await acceptancesOf(noteId)).toBe(0)
    one.socket.close()
    two.socket.close()
  }, 30_000)
})

/**
 * A document whose save keeps failing, and that nobody writes into, keeps its
 * acceptances current on its own clock, and stores its words once the store
 * lets it.
 *
 * **The clock is the service's own timers, faked**, and the lapse is the
 * store's clock: each case ages the acceptance to a minute short of lapsing
 * and then runs the service's time forward.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as encoding from 'lib0/encoding'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { writeSyncStep2 } from 'y-protocols/sync'
import * as Y from 'yjs'

import { NOTE_FRAGMENT, ProseService, type ProseRecord } from './prose.service.js'
import { caseNotes, cases, proseAcceptances, user } from '../db/schema/index.js'
import { ACCEPTANCE_LASTS } from '../db/schema/scoped.js'
import { actingAs } from '../db/scope.js'
import { asRole, hasConcurrentConnections, openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const OWNER_URL = process.env.TEST_DATABASE_URL ?? ''
// No idle or connection timer of the driver's own, so faking the clock ends no connection.
const appPool = URL_
  ? new pg.Pool({ connectionString: URL_, idleTimeoutMillis: 0, connectionTimeoutMillis: 0 })
  : null
const seedPool = URL_ ? openTestPool(asRole(URL_, 'ic_seed')) : null
const ownerPool = OWNER_URL ? openTestPool(OWNER_URL) : null
const seed = seedPool ? drizzle({ client: seedPool }) : null
const asOwner = ownerPool ? drizzle({ client: ownerPool }) : null

/** One analyst's keystrokes, framed as the socket carries them. */
function typed(text: string): Uint8Array {
  const doc = new Y.Doc({ gc: false })
  doc.getXmlFragment(NOTE_FRAGMENT).insert(0, [new Y.XmlText(text)])
  const encoder = encoding.createEncoder()
  writeSyncStep2(encoder, doc)
  return encoding.toUint8Array(encoder)
}

/** Well inside a day an acceptance lasts: how often each clock must at least act. */
const TEN_MINUTES = 10 * 60 * 1000
const TWO_HOURS = 2 * 60 * 60 * 1000

/** Runs the service's clock forward by `ms` a minute at a time, letting the store's own I/O finish between steps. */
async function runFor(ms: number): Promise<void> {
  for (let passed = 0; passed < ms; passed += 60_000) {
    await vi.advanceTimersByTimeAsync(Math.min(60_000, ms - passed))
    for (let turns = 0; turns < 50; turns += 1) await new Promise((next) => setImmediate(next))
  }
}

/** Answers once `check` holds, letting the store's own I/O run between tries. */
async function settles(check: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 500; tries += 1) {
    if (await check()) return true
    await new Promise((next) => setImmediate(next))
  }
  return false
}

describe.skipIf(!appPool || !ownerPool || !hasConcurrentConnections())(
  'a held document on its own clock',
  () => {
    const writer = `prose-clock-${String(process.pid)}-${String(Date.now())}`
    const refusal = `refuse_the_audit_clock_${String(process.pid)}`
    const made: string[] = []

    async function aFailingNote(): Promise<{
      caseId: string
      note: ProseRecord
      prose: ProseService
    }> {
      const caseId = randomUUID()
      made.push(caseId)
      await seed!.insert(cases).values({ id: caseId, title: 'On its own clock' })
      const [row] = await seed!
        .insert(caseNotes)
        .values({ caseId, note: 'seed' })
        .returning({ id: caseNotes.id })
      const note: ProseRecord = { table: 'casenotes', id: row!.id }
      await asOwner!.execute(
        sql.raw(
          `create or replace function ${refusal}() returns trigger language plpgsql as $f$ begin if new.detail->>'record' = '${note.id}' then raise exception 'the audit refuses this line'; end if; return new; end $f$`,
        ),
      )
      await asOwner!.execute(
        sql.raw(
          `create trigger ${refusal} before insert on install_activity for each row execute function ${refusal}()`,
        ),
      )
      const prose = new ProseService(drizzle({ client: appPool! }))
      await actingAs(writer, () => prose.open(caseId, note))
      await actingAs(writer, () =>
        prose.apply(caseId, note, typed(`held ${writer}`), 'a-socket', {
          id: writer,
          label: writer,
          headers: {},
        }),
      )
      await prose.flush(caseId, note)
      return { caseId, note, prose }
    }

    const lift = async () => {
      await asOwner!.execute(sql.raw(`drop trigger if exists ${refusal} on install_activity`))
      await asOwner!.execute(sql.raw(`drop function if exists ${refusal}()`))
    }

    /** Ages the note's acceptances to a minute short of lapsing. */
    const nearlyLapsed = (note: ProseRecord) =>
      asOwner!.execute(
        sql`update prose_acceptances set accepted_at = now() - ${ACCEPTANCE_LASTS}::interval + interval '1 minute' where record_id = ${note.id}`,
      )

    const fresh = async (note: ProseRecord) => {
      const rows = await seed!
        .select({
          fresh: sql<boolean>`${proseAcceptances.acceptedAt} > now() - interval '1 minute'`,
        })
        .from(proseAcceptances)
        .where(eq(proseAcceptances.recordId, note.id))
      return rows.length > 0 && rows.every((one) => one.fresh)
    }

    const stored = async (note: ProseRecord) => {
      const [row] = await seed!
        .select({ note: caseNotes.note })
        .from(caseNotes)
        .where(eq(caseNotes.id, note.id))
      return row!.note.includes(`held ${writer}`)
    }

    beforeAll(async () => {
      await seed!.insert(user).values({
        id: writer,
        name: writer,
        email: `${writer}@example.invalid`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'analyst',
      })
    })

    afterEach(async () => {
      vi.useRealTimers()
      await lift()
    })

    afterAll(async () => {
      for (const id of made) await seed!.delete(cases).where(eq(cases.id, id))
      await seed!.delete(user).where(eq(user.id, writer))
      await appPool!.end()
      await seedPool!.end()
      await ownerPool!.end()
    })

    it('retries a failed save within ten minutes, which keeps its acceptances current, and stores once the store lets it', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
      const { note } = await aFailingNote()
      await nearlyLapsed(note)

      await runFor(TEN_MINUTES)
      const keptByTheRetry = await settles(() => fresh(note))
      await lift()
      await runFor(TEN_MINUTES)
      const storedByTheRetry = await settles(() => stored(note))

      expect({ keptByTheRetry, storedByTheRetry }).toEqual({
        keptByTheRetry: true,
        storedByTheRetry: true,
      })
    })

    it('stops keeping acceptances current once a save stores them, and once the document is released', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
      // The keeper is the service's only interval.
      const keepers = () =>
        Object.values(
          (setTimeout as unknown as { clock: { timers: Record<string, { interval?: number }> } }).clock.timers,
        ).filter((timer) => timer.interval !== undefined).length

      const stored = await aFailingNote()
      const armed = keepers()
      await lift()
      await stored.prose.flush(stored.caseId, stored.note)
      const afterAStore = keepers()
      await stored.prose.release(stored.caseId, stored.note)

      const released = await aFailingNote()
      await released.prose.release(released.caseId, released.note)

      expect({ armed, afterAStore, afterARelease: keepers() }).toEqual({ armed: 1, afterAStore: 0, afterARelease: 0 })
    })

    it('keeps its acceptances current on their own clock within two hours, with no save attempted', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
      const { note, prose } = await aFailingNote()
      const saves = vi.spyOn(prose, 'flush').mockResolvedValue()
      await nearlyLapsed(note)

      await runFor(TWO_HOURS)

      expect(await settles(() => fresh(note))).toBe(true)
      saves.mockRestore()
    })
  },
)

/**
 * Reading the audit, attacked: does it page honestly and mark its own reads?
 *
 * The properties, and why each is an attack rather than a demonstration:
 *
 * - **A cursor may not skip or repeat a line.** That is the whole reason `seq`
 *   exists, and the failure is silent: a collector that loses one line at
 *   every page boundary reports a complete log.
 * - **A run is counted across the table, not within the page.** Counting
 *   inside the page makes the same event louder or quieter depending on where
 *   somebody scrolled to.
 * - **Reading is recorded, once per reader per hour** - and a second read
 *   inside the hour must add nothing, or a collector buries the log in the
 *   fact that it was read.
 */
import { readFileSync } from 'node:fs'

import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq, gte } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { InstallActivityReadService, READ_IS_ONE_VISIT_FOR_MINUTES } from './read.service.js'
import { recordInstallActivity } from '../install-activity/record.js'
import { RUN_IS_AN_ATTACK, SEVERITY_ID } from '../install-activity/severity.js'
import { installActivity, user } from '../db/schema/index.js'
import { asRole, openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = URL_ ? openTestPool(asRole(URL_, 'ic_seed')) : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

const READER = 'test-audit-reader'
const session = {
  user: { id: READER, name: 'Audit Reader', email: `${READER}@example.test` },
} as never

describe.skipIf(!db)('reading the audit', () => {
  let reads: InstallActivityReadService

  beforeEach(async () => {
    reads = new InstallActivityReadService(db!)
    await seed!.delete(user).where(eq(user.id, READER))
    await seed!.insert(user).values({
      id: READER,
      name: 'Audit Reader',
      email: `${READER}@example.test`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterAll(async () => {
    await seed!.delete(user).where(eq(user.id, READER))
    await pool!.end()
    await seedPool?.end()
  })

  /**
   * **Every line exactly once across a page boundary.** The cursor is the one
   * thing a reader cannot check for itself: a page that quietly drops its last
   * row looks identical to a page that ends there.
   */
  it('pages without skipping or repeating a line', async () => {
    const mark = `page-${String(Date.now())}`
    for (let i = 0; i < 5; i += 1) {
      await recordInstallActivity(db!, {
        event: 'case_created',
        target: `${mark}-${String(i)}`,
      })
    }

    const first = await reads.page({ channel: 'case', limit: 2 }, session, {})
    expect(first.events).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()

    const second = await reads.page(
      { channel: 'case', limit: 2, after: first.nextCursor! },
      session,
      {},
    )

    const seen = [...first.events, ...second.events].map((one) => one.seq)
    expect(new Set(seen).size, 'a line came back on both pages').toBe(seen.length)
    // Monotone, so the cursor neither went backwards nor handed a line back.
    // Gaplessness is not assertable here: a channel filter leaves the seqs of
    // a page non-contiguous whether or not anything was lost.
    const ours = seen.map(BigInt)
    for (let i = 1; i < ours.length; i += 1) {
      expect(ours[i]! < ours[i - 1]!, 'the cursor went backwards').toBe(true)
    }
  })

  it('reports no cursor on the last page', async () => {
    const page = await reads.page({ limit: 200 }, session, {})
    if (page.events.length < 200) expect(page.nextCursor).toBeNull()
  })

  /**
   * **The run is what turns a typo into a finding**, so it is computed over
   * the table rather than the page - and this asks for a page of one to prove
   * it, because a page-local count would answer 1.
   */
  it('counts a run across the table, not within the page', async () => {
    const headers = { 'x-real-ip': `203.0.113.${String(Date.now() % 200)}` }
    for (let i = 0; i < RUN_IS_AN_ATTACK; i += 1) {
      await recordInstallActivity(db!, {
        event: 'sign_in_failed',
        target: 'runner@example.test',
        headers,
      })
    }

    const page = await reads.page({ channel: 'authentication', limit: 1 }, session, {})
    const line = page.events[0]

    expect(line?.event).toBe('sign_in_failed')
    expect(line?.runLength).toBeGreaterThanOrEqual(RUN_IS_AN_ATTACK)
    // Which is what makes it High. A lone failure is Low.
    expect(line?.severity).toBe('High')
  })

  /**
   * **A run is one line; two different facts are two lines.** The collapse is
   * what makes the page readable, and it is one partition column away from
   * being a lie: leave the target out of the window and five different cases
   * merge into one row reading `Case created x5`.
   */
  it('collapses a repeat but never merges two different targets', async () => {
    const mark = `collapse-${String(Date.now())}`
    const headers = { 'x-real-ip': `198.51.100.${String(Date.now() % 200)}` }
    for (let i = 0; i < 3; i += 1) {
      await recordInstallActivity(db!, { event: 'case_created', target: mark, headers })
    }
    await recordInstallActivity(db!, { event: 'case_created', target: `${mark}-other`, headers })

    const page = await reads.page({ channel: 'case', limit: 50 }, session, {})
    const ours = page.events.filter((one) => one.targetLabel?.startsWith(mark))

    expect(ours, 'two targets must stay two lines').toHaveLength(2)
    const repeated = ours.find((one) => one.targetLabel === mark)
    expect(repeated?.runLength, 'the repeat is one line carrying its count').toBe(3)
    const alone = ours.find((one) => one.targetLabel === `${mark}-other`)
    expect(alone?.runLength).toBe(1)
  })

  /**
   * **Reaching the record requires reach.** The other half of the same
   * scenario as the case below, kept here so both are answerable from one
   * file: *the reading is recorded* and *reaching it required reach*.
   *
   * The running proof is `server/test/analyst-privilege.test.ts`, which
   * presses `GET /api/install/activity` as an analyst and is refused. What is
   * asserted here is that the route still declares the gate at all -- read off
   * the source because `@AdminOnly()` is greppable on purpose, which is the
   * surface `install-activity/coverage.test.ts` already leans on.
   */
  it('is a route only an administrator reaches', () => {
    const source = readFileSync(new URL('activity.controller.ts', import.meta.url), 'utf8')
    expect(source, 'the audit read route no longer declares its gate').toContain('@AdminOnly()')
  })

  it('records that the audit was read', async () => {
    const before = new Date(Date.now() - 5_000)
    await reads.page({ limit: 1 }, session, {})

    const marks = await db!
      .select()
      .from(installActivity)
      .where(
        and(
          eq(installActivity.event, 'audit_read'),
          eq(installActivity.actorId, READER),
          gte(installActivity.at, before),
        ),
      )

    expect(marks).toHaveLength(1)
    expect(marks[0]?.channel).toBe('operations')
  })

  it('records one visit per reader per hour, not one per request', async () => {
    const before = new Date(Date.now() - 5_000)
    await reads.page({ limit: 1 }, session, {})
    await reads.page({ limit: 1 }, session, {})
    await reads.page({ limit: 1 }, session, {})

    const marks = await db!
      .select()
      .from(installActivity)
      .where(
        and(
          eq(installActivity.event, 'audit_read'),
          eq(installActivity.actorId, READER),
          gte(installActivity.at, before),
        ),
      )

    expect(marks, `${String(READ_IS_ONE_VISIT_FOR_MINUTES)} minutes is one visit`).toHaveLength(1)
  })

  it('narrows to one log and counts the rest', async () => {
    const page = await reads.page({ channel: 'authentication', limit: 50 }, session, {})

    expect(page.events.every((one) => one.channel === 'authentication')).toBe(true)
    // The tab row needs every channel's count, not only the one being shown.
    expect(Object.keys(page.counts).length).toBeGreaterThan(1)
  })

  /**
   * **A served filter that narrows nothing is worse than an absent one.** A
   * `minSeverity` the query schema documents and the query never reads lets a
   * screen wire chips to it, filter perfectly on screen, and show every line.
   */
  it('narrows to lines at or above the asked severity', async () => {
    await recordInstallActivity(db!, { event: 'case_deleted', target: `gone-${String(Date.now())}` })

    const page = await reads.page({ minSeverity: SEVERITY_ID.Medium, limit: 200 }, session, {})

    expect(page.events.length).toBeGreaterThan(0)
    expect(
      page.events.every((one) => one.severityId >= SEVERITY_ID.Medium),
      'a line below the floor came back',
    ).toBe(true)
    // And it must actually be excluding something, or the assertion above is
    // satisfied by a log that happens to hold nothing quiet.
    const all = await reads.page({ limit: 200 }, session, {})
    expect(all.events.length).toBeGreaterThan(page.events.length)
  })

  /**
   * **The floor is applied to the severity the reader is shown, not the one
   * the row stored.** A run of failures is raised to High at read time; a
   * filter reading the stored column would drop it while the page says High,
   * which hides exactly the lines a severity filter is reached for.
   */
  it('keeps a run raised to High, whose stored severity is below the floor', async () => {
    const headers = { 'x-real-ip': `192.0.2.${String(Date.now() % 200)}` }
    const target = `raised-${String(Date.now())}@example.test`
    for (let i = 0; i < RUN_IS_AN_ATTACK; i += 1) {
      await recordInstallActivity(db!, { event: 'sign_in_failed', target, headers })
    }

    const stored = await db!
      .select({ severityId: installActivity.severityId })
      .from(installActivity)
      .where(eq(installActivity.targetLabel, target))
    expect(
      stored.every((one) => one.severityId < SEVERITY_ID.High),
      'the row must store below High, or this test proves nothing',
    ).toBe(true)

    const page = await reads.page({ minSeverity: SEVERITY_ID.High, limit: 200 }, session, {})

    expect(page.events.some((one) => one.targetLabel === target)).toBe(true)
  })

  /**
   * **A chip's number and what pressing it yields are one claim, not two.**
   * Tally the counts on the stored floor while the column and the filter read
   * the raised level, and a run of failures drawn as High counts as Low - a
   * `High 0` chip over a page of High lines.
   */
  it('counts each severity as the number the filter would return', async () => {
    const headers = { 'x-real-ip': `198.18.0.${String(Date.now() % 200)}` }
    for (let i = 0; i < RUN_IS_AN_ATTACK; i += 1) {
      await recordInstallActivity(db!, {
        event: 'sign_in_failed',
        target: `tally-${String(Date.now())}@example.test`,
        headers,
      })
    }

    const all = await reads.page({ limit: 200 }, session, {})
    const high = await reads.page({ minSeverity: SEVERITY_ID.High, limit: 200 }, session, {})

    expect(all.severities['High'] ?? 0).toBeGreaterThan(0)
    expect(
      high.events.length,
      'the High chip must count what pressing High returns',
    ).toBe(all.severities['High'] ?? 0)
  })
  /**
   * **The other direction, and it is the one the requirement is worded as:**
   * *a line stored as serious does not read as less serious than it was
   * stored.*
   *
   * The case above shows the read **raising** a line above its stored level.
   * Nothing showed that it cannot **lower** one -- and the read does not simply
   * return the stored column, it computes `greatest(stored, run-derived)`. Drop
   * the `greatest` and a Critical line whose event is in no run reads
   * Informational: the loudest line in the log, quietly filed under the
   * quietest heading, and only on the screen somebody reaches for it on.
   *
   * A shortened retention window is the subject because it is the one act the
   * vocabulary files at Critical, and it is in no run.
   */
  it('never reads a line as less serious than it was stored', async () => {
    const target = `not-lowered-${String(Date.now())}@example.test`
    await recordInstallActivity(db!, {
      event: 'audit_retention_changed',
      target,
      // Shortening it: `severityOf` files that Critical, which is the point.
      detail: { from: '365', to: '7' },
    })

    const [stored] = await db!
      .select({ severityId: installActivity.severityId })
      .from(installActivity)
      .where(eq(installActivity.targetLabel, target))
    expect(stored?.severityId, 'the fixture no longer stores a serious line').toBe(
      SEVERITY_ID.Critical,
    )

    const page = await reads.page({ limit: 200 }, session, {})
    const read = page.events.find((one) => one.targetLabel === target)

    expect(read, 'the line it stored did not come back').toBeDefined()
    expect(
      read?.severityId,
      'the read lowered a stored severity, so the loudest line reads as the quietest',
    ).toBeGreaterThanOrEqual(SEVERITY_ID.Critical)

    /**
     * **Taken back out, because a sibling counts exactly.** `counts each
     * severity as the number the filter would return` tallies the whole table,
     * so a Critical line left behind moves its numbers and fails it. The cases
     * that may leave rows behind are the ones whose siblings only ever assert
     * *containment*.
     */
    await seed!.delete(installActivity).where(eq(installActivity.targetLabel, target))
  })
})

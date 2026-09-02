/**
 * Retention, attacked: can the window be shortened enough to lose evidence?
 *
 * The pruner is the only delete path that exists, so every test here is a way
 * of asking whether it can be turned into an eraser. Against a real Postgres,
 * because the control is a row-level-security policy and a substitute engine
 * would simply not have one.
 *
 * The properties:
 *
 * - **A line inside the window survives**, whatever the pruner is asked.
 * - **The floor holds in the database as well as in the service**, so a caller
 *   reaching the transaction directly is refused too.
 * - **An unset window deletes nothing**, rather than everything - which is the
 *   failure mode of every "delete where older than $VAR" that has ever shipped
 *   with `$VAR` empty.
 */
import { desc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { RETENTION_DEFAULT_DAYS, refuseOperationalRetention } from './prune.service.js'
import { InstallActivityPruneService, refuseRetention } from './prune.service.js'
import { recordInstallActivity } from './record.js'
import { OPERATIONAL_FLOOR_DAYS, RETENTION_FLOOR_DAYS, installActivity } from '../db/schema/install-activity.js'
import { asRole, openTestPool } from '../../test/database.js'
import { classify } from './ocsf.js'
import { SEVERITY_ID, outcomeOf, severityOf } from './severity.js'
import type { InstallEvent } from './record.js'

/** The five stored OCSF columns, as the writer would stamp them. */
function ocsfColumns(event: InstallEvent) {
  const ocsf = classify(event)
  return {
    classUid: ocsf.classUid,
    activityId: ocsf.activityId,
    typeUid: ocsf.typeUid,
    severityId: SEVERITY_ID[severityOf({ event })],
    statusId: outcomeOf(event) === 'failure' ? 2 : 1,
  }
}

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * The DDL role, and the only handle that can write an old row.
 *
 * **Aging a row is deliberately impossible through `ic_app`** - the insert
 * policy pins `at` to within a minute of now - so the one test that proves the
 * pruner deletes anything has to reach past the policy to arrange its fixture.
 *
 * **Derived from the URL the suite is pointed at, never from
 * `IC_MIGRATE_DATABASE_URL`.** That variable names the *dev* database while
 * this suite runs against `incidentcompanion_test`, so a fixture using it
 * writes its row into another database entirely - the insert succeeds, the
 * assertion reads an empty table, and the failure reads as a broken policy.
 * Measured: it cost two rounds here and the same shape had already cost two
 * elsewhere in this session.
 */
const migratePool = URL_ ? openTestPool(asRole(URL_, 'ic_migrate')) : null
const migrate = migratePool ? drizzle({ client: migratePool }) : null

describe.skipIf(!db)('pruning the audit', () => {
  let pruner: InstallActivityPruneService
  /**
   * **A fresh target per test, because a fixture here cannot tidy up.**
   * The table is append-only: no `beforeEach` can delete what the last test
   * wrote, and the first version of this file asserted a row count that grew
   * by two on every run. Unique labels are the only isolation available.
   */
  let RECENT: string

  beforeEach(async () => {
    pruner = new InstallActivityPruneService(db!)
    RECENT = `prune-recent-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    await recordInstallActivity(db!, { event: 'signed_in', target: RECENT })
  })

  afterAll(async () => {
    await pool!.end()
    await migratePool?.end()
  })

  async function survivors(target: string) {
    return db!.select().from(installActivity).where(eq(installActivity.targetLabel, target))
  }

  it('deletes nothing when the window has not been declared', async () => {
    // The attack, and the shape every "$VAR is empty" incident takes: a plain
    // DELETE outside the pruner's transaction.
    const gone = await db!.delete(installActivity)

    expect(gone.rowCount).toBe(0)
    expect(await survivors(RECENT)).toHaveLength(1)
  })

  it('keeps a line that is inside the window', async () => {
    const count = await pruner.prune(RETENTION_FLOOR_DAYS)

    expect(count).toBe(0)
    expect(await survivors(RECENT)).toHaveLength(1)
  })

  it('refuses a window shorter than the floor, in words', () => {
    expect(refuseRetention(RETENTION_FLOOR_DAYS - 1)).toMatch(/at least/i)
    expect(refuseRetention(0)).toMatch(/at least/i)
    expect(refuseRetention(-1)).toMatch(/at least/i)
    expect(refuseRetention(1.5)).toMatch(/whole number/i)
    expect(refuseRetention(RETENTION_FLOOR_DAYS)).toBeNull()
  })

  /**
   * **The service's refusal is not the control.** Anything that can open a
   * transaction can set the interval itself, so the floor has to be in the
   * policy as well - this is the test that says which of the two is load
   * bearing.
   */
  it('refuses a short window in the database, not only in the service', async () => {
    const gone = await db!.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.audit_retention', '1 second', true)`)
      return tx.delete(installActivity)
    })

    expect(gone.rowCount).toBe(0)
    expect(await survivors(RECENT)).toHaveLength(1)
  })

  /**
   * A zero window is the one an operator reaches for meaning "off", and it is
   * also what an uninitialised variable interpolates to.
   */
  it('refuses a zero window in the database', async () => {
    const gone = await db!.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.audit_retention', '0 days', true)`)
      return tx.delete(installActivity)
    })

    expect(gone.rowCount).toBe(0)
  })

  /**
   * **The permission must not outlive the statement.** `set_config`'s third
   * argument is `is_local`; passing `false` would leave the pooled connection
   * able to delete on the next request that borrows it.
   */
  it('does not leave the connection able to delete afterwards', async () => {
    await pruner.prune(RETENTION_FLOOR_DAYS)

    const after = await db!.delete(installActivity)

    expect(after.rowCount).toBe(0)
    expect(await survivors(RECENT)).toHaveLength(1)
  })

  /**
   * **The two windows are separate permissions, and the short one must not
   * reach an audit line.** This is the case that would be silent if it broke:
   * an administrator sets operational retention to a week, and a year of
   * sign-in failures goes with it on the next nightly run.
   *
   * The row is backdated past the operational window and left inside the audit
   * one, so only a policy that reads the row's own class can get this right.
   *
   * **It ages the row through `ic_migrate` because an append may not choose
   * its own clock.** A compromised write path cannot file a line last year -
   * where nobody reading the recent log would see it - or in the future, where
   * it sits above every real event for ever, so backdating is deliberately
   * impossible through the role the app runs as.
   */
  it('does not let the short window prune an audit line', async () => {
    const target = `class-audit-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    await recordInstallActivity(db!, { event: 'sign_in_failed', target })
    // Backdate past the operational window, but well inside the audit one.
    await migrate!.execute(
      sql`update install_activity set at = now() - interval '60 days'
          where target_label = ${target}`,
    )

    const gone = await pruner.prune(RETENTION_DEFAULT_DAYS, OPERATIONAL_FLOOR_DAYS)

    expect(gone, 'the short window reached a line it does not own').toBe(0)
    expect(await survivors(target)).toHaveLength(1)
  })

  /**
   * **And the short window does prune its own.** Without this the test above
   * passes on a pruner that deletes nothing at all.
   */
  it('prunes an operational line the short window has passed', async () => {
    const target = `class-op-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    await recordInstallActivity(db!, { event: 'api_called', target })
    await migrate!.execute(
      sql`update install_activity set at = now() - interval '60 days'
          where target_label = ${target}`,
    )

    const gone = await pruner.prune(RETENTION_DEFAULT_DAYS, OPERATIONAL_FLOOR_DAYS)

    expect(gone).toBeGreaterThan(0)
    expect(await survivors(target)).toHaveLength(0)
  })

  /**
   * **A line's class is stamped, not recomputed.** If the pruner derived it,
   * the statement that destroys rows would be the one deciding which class
   * they are - and the two implementations would be free to disagree.
   */
  it('stamps the class on the row', async () => {
    const target = `class-stamp-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    await recordInstallActivity(db!, { event: 'api_called', target })

    const [row] = await survivors(target)

    expect(row?.retentionClass).toBe('operational')
  })

  /**
   * **A prune must leave an account of itself, in the audit.**
   *
   * It was written with a Nest `Logger`, which is an application log line
   * rather than a row here -- and `compose.yaml` sets `logging: driver:
   * "none"` on the app service, so the line is discarded and `compose logs`
   * refuses to show it. An account of a deletion written to a log the
   * deployment throws away is written nowhere, and a gap in the audit cannot
   * then be told apart from a period when nothing happened.
   */
  it('records what it removed, in the audit rather than in a log', async () => {
    const target = `pruned-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    await recordInstallActivity(db!, { event: 'api_called', target })
    await migrate!.execute(
      sql`update install_activity set at = now() - interval '60 days'
          where target_label = ${target}`,
    )

    const gone = await pruner.prune(RETENTION_DEFAULT_DAYS, OPERATIONAL_FLOOR_DAYS)
    expect(gone, 'nothing was pruned, so this proves nothing').toBeGreaterThan(0)

    const [line] = await db!
      .select()
      .from(installActivity)
      .where(eq(installActivity.event, 'audit_pruned'))
      .orderBy(desc(installActivity.at))
      .limit(1)

    expect(line, 'a prune left no account of itself').toBeDefined()
    // What was pruned, how much, and under which windows -- the three the
    // specification asks for.
    expect(line!.detail).toMatchObject({
      removed: String(gone),
      auditDays: String(RETENTION_DEFAULT_DAYS),
      operationalDays: String(OPERATIONAL_FLOOR_DAYS),
    })
  })

  /**
   * **Silence when it took nothing.** A line on every scheduled run that
   * removed nothing is the noise that teaches a reader to scroll past the
   * event, which costs more than it buys.
   */
  it('writes no line for a prune that removed nothing', async () => {
    // **Drained first.** Other cases here backdate rows and the table is
    // append-only, so nothing tidies up between them and a bare prune would
    // sweep their leavings -- which is not the state under test.
    await pruner.prune(RETENTION_DEFAULT_DAYS, OPERATIONAL_FLOOR_DAYS)

    const before = await db!
      .select()
      .from(installActivity)
      .where(eq(installActivity.event, 'audit_pruned'))

    const gone = await pruner.prune(RETENTION_DEFAULT_DAYS, OPERATIONAL_FLOOR_DAYS)
    expect(gone, 'the drain above left something behind').toBe(0)

    const after = await db!
      .select()
      .from(installActivity)
      .where(eq(installActivity.event, 'audit_pruned'))
    expect(after.length, 'an empty prune still announced itself').toBe(before.length)
  })

  /**
   * **The account outlives the operational window it reports on.** Stamped
   * `operational`, the next prune would take the record of the last one, and
   * the audit would lose exactly the lines that say why it is short.
   */
  it('keeps its own account under the audit window, not the operational one', async () => {
    const target = `pruned-class-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    await recordInstallActivity(db!, { event: 'api_called', target })
    await migrate!.execute(
      sql`update install_activity set at = now() - interval '60 days'
          where target_label = ${target}`,
    )

    await pruner.prune(RETENTION_DEFAULT_DAYS, OPERATIONAL_FLOOR_DAYS)

    const [line] = await db!
      .select()
      .from(installActivity)
      .where(eq(installActivity.event, 'audit_pruned'))
      .orderBy(desc(installActivity.at))
      .limit(1)

    expect(line?.retentionClass).toBe('audit')
  })

  it('refuses an operational window under its own floor, in words', () => {
    const why = refuseOperationalRetention(OPERATIONAL_FLOOR_DAYS - 1)

    expect(why).toMatch(/at least/i)
  })


  /**
   * **The statement's own `where`, with the policy out of the way.**
   *
   * The two cases above pass even when the `where` ignores the class entirely
   * - measured, by deleting the `case` expression and watching all twelve stay
   * green. That is the two-bound design working: the RLS policy refused the
   * audit row the statement had matched. It also means those cases say nothing
   * about the `where`, which is the only bound left the day somebody loosens
   * the policy - exactly the day it matters.
   *
   * `ic_migrate` owns the table and RLS is not forced, so a pruner built on it
   * runs with the policy inert. What survives here is what the `where` alone
   * decided.
   */
  it('bounds the delete by class even with the policy inert', async () => {
    const keep = `owner-audit-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    const drop = `owner-op-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    await recordInstallActivity(db!, { event: 'sign_in_failed', target: keep })
    await recordInstallActivity(db!, { event: 'api_called', target: drop })
    await migrate!.execute(
      sql`update install_activity set at = now() - interval '60 days'
          where target_label in (${keep}, ${drop})`,
    )

    const asOwner = new InstallActivityPruneService(migrate!)
    await asOwner.prune(RETENTION_DEFAULT_DAYS, OPERATIONAL_FLOOR_DAYS)

    expect(
      await survivors(keep),
      'with the policy inert, the where let the short window take an audit line',
    ).toHaveLength(1)
    expect(await survivors(drop), 'the where kept a line it should have pruned').toHaveLength(0)
  })

  it('refuses an append that backdates or postdates itself', async () => {
    const old_ = db!.insert(installActivity).values({
      ...ocsfColumns('signed_in'),
      event: 'signed_in',
      channel: 'authentication',
      at: new Date('2020-01-01'),
    })
    const ahead = db!.insert(installActivity).values({
      ...ocsfColumns('signed_in'),
      event: 'signed_in',
      channel: 'authentication',
      at: new Date(Date.now() + 60 * 60 * 1000),
    })

    await expect(old_).rejects.toThrow()
    await expect(ahead).rejects.toThrow()
  })

  /**
   * **The one test that proves the delete works at all**, and it needs a row
   * the app's own role cannot write. Everything above asserts a refusal; a
   * suite of refusals is satisfied by a policy that permits nothing, which
   * would be a broken pruner reading as a strict one.
   */
  it.skipIf(!migrate)('deletes a line that is genuinely past the window', async () => {
    const target = `prune-ancient-${String(Date.now())}`
    await migrate!.insert(installActivity).values({
      // **Classified here too, because the columns are `NOT NULL`.** A fixture
      // that could skip them would be writing a row the writer cannot produce,
      // which is the shape of a test that passes on data the app never makes.
      ...ocsfColumns('signed_in'),
      event: 'signed_in',
      channel: 'authentication',
      targetLabel: target,
      // Comfortably past the floor, and written as the role the policy does
      // not govern - the one this control never claimed to stop.
      at: sql`now() - make_interval(days => ${RETENTION_FLOOR_DAYS + 1})`,
    })
    expect(await survivors(target)).toHaveLength(1)

    const count = await pruner.prune(RETENTION_FLOOR_DAYS)

    expect(count).toBeGreaterThanOrEqual(1)
    expect(await survivors(target)).toHaveLength(0)
    // And the row inside the window is untouched by the same statement.
    expect(await survivors(RECENT)).toHaveLength(1)
  })
})

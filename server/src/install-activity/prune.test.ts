/**
 * Retention, attacked: can the window be shortened enough to lose evidence?
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
 */
const migratePool = URL_ ? openTestPool(asRole(URL_, 'ic_migrate')) : null
const migrate = migratePool ? drizzle({ client: migratePool }) : null

describe.skipIf(!db)('pruning the audit', () => {
  let pruner: InstallActivityPruneService
  /**
   * **A fresh target per test, because a fixture here cannot tidy up.**
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
   * **The service's refusal is not the control.**
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
   * **The permission must not outlive the statement.**
   */
  it('does not leave the connection able to delete afterwards', async () => {
    await pruner.prune(RETENTION_FLOOR_DAYS)

    const after = await db!.delete(installActivity)

    expect(after.rowCount).toBe(0)
    expect(await survivors(RECENT)).toHaveLength(1)
  })

  /**
   * **The two windows are separate permissions, and the short one must not reach
   * an audit line.**
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
   * **A line's class is stamped, not recomputed.**
   */
  it('stamps the class on the row', async () => {
    const target = `class-stamp-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    await recordInstallActivity(db!, { event: 'api_called', target })

    const [row] = await survivors(target)

    expect(row?.retentionClass).toBe('operational')
  })

  /**
   * **A prune must leave an account of itself, in the audit.**
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
   * **Silence when it took nothing.**
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
   * **The one test that proves the delete works at all**, and it needs a row the
   * app's own role cannot write.
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

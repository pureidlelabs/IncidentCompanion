/**
 * The audit log, attacked: can a line be erased, forged, or lost in silence?
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Logger } from '@nestjs/common'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { recordInstallActivity } from './record.js'
import { installActivity, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * The role a fixture arranges rows with, and the one an attack is run from.
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'test-audit-analyst'

describe.skipIf(!db)('the install audit log', () => {
  beforeEach(async () => {
    await seed!.delete(user).where(eq(user.id, ANALYST))
    await seed!.insert(user).values({
      id: ANALYST,
      name: 'Audit Analyst',
      email: `${ANALYST}@example.test`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterAll(async () => {
    await seed!.delete(user).where(eq(user.id, ANALYST))
    await pool!.end()
  })

  /** The rows this test's own writes produced, newest last. */
  async function written(target: string) {
    return db!.select().from(installActivity).where(eq(installActivity.targetLabel, target))
  }

  it('refuses to let the app role edit a line after it is written', async () => {
    const target = `edit-me-${Date.now()}`
    await recordInstallActivity(db!, {
      event: 'account_role_changed',
      actor: { id: ANALYST, label: 'Audit Analyst' },
      target,
      detail: { from: 'analyst', to: 'admin' },
    })

    // The attack: rewrite the line so it says the role went the other way.
    const changed = await db!
      .update(installActivity)
      .set({ detail: { from: 'admin', to: 'analyst' } })
      .where(eq(installActivity.targetLabel, target))

    expect(changed.rowCount).toBe(0)
    const [row] = await written(target)
    expect(row?.detail).toEqual({ from: 'analyst', to: 'admin' })
  })

  it('refuses to let either role delete a line, including the seeder', async () => {
    const target = `delete-me-${Date.now()}`
    await recordInstallActivity(db!, { event: 'account_disabled', target })

    const byApp = await db!
      .delete(installActivity)
      .where(eq(installActivity.targetLabel, target))
    const bySeeder = await seed!
      .delete(installActivity)
      .where(eq(installActivity.targetLabel, target))

    expect(byApp.rowCount).toBe(0)
    expect(bySeeder.rowCount).toBe(0)
    expect(await written(target)).toHaveLength(1)
  })

  /**
   * **TRUNCATE is a table privilege and row-level security does not see it**, so
   * the two policies above are worth nothing on their own: `ic_seed` held
   * `TRUNCATE ON ALL TABLES` and could empty the log in one statement while
   * being refused a single-row delete.
   */
  it('refuses to let the seeder truncate the log', async () => {
    const target = `survive-truncate-${Date.now()}`
    await recordInstallActivity(db!, { event: 'signed_in', target })

    // **Assert on the cause, not the message.** Drizzle rewrites a driver
    // error to `Failed query: ...`, so `toThrow(/permission denied/)` fails on a
    // correctly refused TRUNCATE - and would have passed on any other error
    // just as readily, which is the half that matters.
    const refused = await seed!.execute('truncate install_activity').catch((why: unknown) => why)
    expect(refused).toBeInstanceOf(Error)
    expect(String((refused as { cause?: unknown }).cause)).toMatch(/permission denied/i)
    expect(await written(target)).toHaveLength(1)
  })

  it('keeps who did it after the account is deleted', async () => {
    const target = `orphan-me-${Date.now()}`
    await recordInstallActivity(db!, {
      event: 'account_created',
      actor: { id: ANALYST, label: 'Audit Analyst' },
      target,
    })

    await seed!.delete(user).where(eq(user.id, ANALYST))

    const [row] = await written(target)
    expect(row?.actorId).toBeNull()
    // The whole reason the label is copied rather than joined: the line still
    // says who, when the account it pointed at is gone.
    expect(row?.actorLabel).toBe('Audit Analyst')
  })

  it('does not let a caller write their own origin', async () => {
    const target = `forge-origin-${Date.now()}`
    await recordInstallActivity(db!, {
      event: 'sign_in_failed',
      target,
      headers: {
        // Attacker-controlled at this app's edge: nginx does not overwrite it.
        'x-forwarded-for': '10.0.0.1',
        'x-real-ip': '203.0.113.9',
        'user-agent': 'Probe/1.0',
      },
    })

    const [row] = await written(target)
    expect(row?.ipAddress).toBe('203.0.113.9')
    expect(row?.userAgent).toBe('Probe/1.0')
  })

  it('records no origin at all rather than a forged one', async () => {
    const target = `no-real-ip-${Date.now()}`
    await recordInstallActivity(db!, {
      event: 'sign_in_failed',
      target,
      headers: { 'x-forwarded-for': '10.0.0.1' },
    })

    const [row] = await written(target)
    expect(row?.ipAddress).toBeNull()
  })
})

describe('a write the database refuses', () => {
  /**
   * **Swallowed, and loudly.**
   */
  it('does not throw, and says so at error level', async () => {
    const said = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    const broken = {
      insert: () => ({
        values: () => Promise.reject(new Error('relation "install_activity" does not exist')),
      }),
    } as never

    // **Resolves `false` rather than throwing.** The caller has to know
    // whether the line landed: a typed method marks the request accounted for,
    // and marking after a write that did not happen loses the act entirely.
    await expect(
      recordInstallActivity(broken, { event: 'regime_switched', target: 'NIS2' }),
    ).resolves.toBe(false)

    expect(said).toHaveBeenCalledOnce()
    expect(said.mock.calls[0]?.[0]).toContain('regime_switched')
    expect(said.mock.calls[0]?.[0]).toContain('NIS2')
    said.mockRestore()
  })

  /**
   * **The target is attacker-supplied on the one event most likely to fail.**
   */
  it('cannot be made to forge a line in the operator log', async () => {
    const said = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    const broken = { insert: () => ({ values: () => Promise.reject(new Error('down')) }) } as never

    await recordInstallActivity(broken, {
      event: 'sign_in_failed',
      target: 'nobody@example.test\n2026-08-23 ERROR [Auth] signed_in on admin@example.test',
    })

    const line = String(said.mock.calls[0]?.[0])
    expect(line).not.toContain('\n')
    expect(line).not.toContain('\r')
    // The content survives, escaped - dropping it would lose which account was
    // attacked, which is the reason the field is recorded at all.
    expect(line).toContain('nobody@example.test')
    said.mockRestore()
  })
})

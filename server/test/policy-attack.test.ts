/**
 * **The settings surface, attacked as a way to switch a control off.**
 *
 * Every setting here is a bound on a security control, so the route that
 * writes them is a route that can weaken them. The interesting failures are
 * not "can an analyst reach it" - `@AdminOnly` answers that - but the ones
 * where the write *succeeds* and the install still believes it is protected:
 *
 * - a value past the ceiling stored, so the control is off while the screen
 *   shows a number,
 * - a key nothing declared written into the settings table, making this an
 *   arbitrary-write route,
 * - a change that takes effect only after a restart, so the screen and the
 *   control disagree for as long as the process lives,
 * - a change nobody can find afterwards, or filed so quietly that every
 *   default filter hides it.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DATABASE } from '../src/db/db.module.js'
import type { Database } from '../src/db/client.js'
import { installActivity } from '../src/db/schema/index.js'
import { installPreferences } from '../src/db/schema/preferences.js'
import { POLICY_SETTINGS } from '../src/policy/keys.js'
import { readPolicy } from '../src/policy/read.js'
import {
  boot,
  bootable,
  sharedAdmin,
  sharedAnalyst,
  type Harness,
  type Persona,
} from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('attacking the policy settings', () => {
  let harness: Harness
  let admin: Persona
  let analyst: Persona
  let db: Database

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    analyst = await sharedAnalyst(harness)
    db = harness.app.get<Database>(DATABASE)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  const put = (body: unknown, cookie: string) =>
    fetch(`${harness.base}/api/install/policy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })

  const stored = async (key: string) => {
    const [row] = await db
      .select()
      .from(installPreferences)
      .where(eq(installPreferences.key, key))
      .limit(1)
    return row?.value
  }

  /**
   * **The one that turns the lockout off.** A threshold of a million is a
   * control that never fires, and the screen would still show a number - which
   * is worse than having no setting, because the install believes it is
   * protected.
   */
  it('refuses a threshold past the ceiling, and stores nothing', async () => {
    const key = 'auth.lockoutAfterFailures'
    const before = await stored(key)

    const refused = await put({ key, value: 1_000_000 }, admin.cookie)

    expect(refused.status).toBe(422)
    expect(await stored(key), 'a refused value was written anyway').toEqual(before)
    expect(
      (await readPolicy(db))[key],
      'the control read a value past its own ceiling',
    ).toBeLessThanOrEqual(POLICY_SETTINGS[key].ceiling)
  })

  it.each([0, -1, 2.5])('refuses %s as a threshold', async (value) => {
    const refused = await put({ key: 'auth.lockoutAfterFailures', value }, admin.cookie)
    expect(refused.ok).toBe(false)
  })

  /**
   * **A key nothing declared must not reach the table.** Without the enum on
   * the body this route writes whatever it is handed, which is an
   * arbitrary-write path that an administrator's session should not carry
   * either - the next reader of that table is a control deciding something.
   */
  it('refuses a key the registry does not declare', async () => {
    const refused = await put({ key: 'auth.lockoutDisabled', value: 1 }, admin.cookie)

    expect(refused.ok).toBe(false)
    expect(await stored('auth.lockoutDisabled'), 'an undeclared key was stored').toBeUndefined()
  })

  /** And it may not smuggle one past by adding a field. */
  it('refuses a body carrying anything extra', async () => {
    const refused = await put(
      { key: 'auth.lockoutMinutes', value: 30, alsoSet: 'auth.minPasswordLength' },
      admin.cookie,
    )

    expect(refused.ok).toBe(false)
  })

  it('refuses an analyst entirely', async () => {
    const refused = await put({ key: 'auth.lockoutMinutes', value: 30 }, analyst.cookie)

    expect(refused.status).toBe(403)
  })

  it('refuses a caller with no session', async () => {
    const refused = await put({ key: 'auth.lockoutMinutes', value: 30 }, '')

    expect(refused.ok).toBe(false)
    expect(refused.status).not.toBe(200)
  })

  /**
   * **A change has to take effect now, not on the next restart.** This is the
   * failure that looks like everything working: the screen shows the new
   * number, the audit records the change, and the control goes on using the
   * value it read at boot.
   */
  it('is read by the control on the next check, without a restart', async () => {
    const key = 'auth.lockoutAfterFailures'
    const target = 7

    const ok = await put({ key, value: target }, admin.cookie)
    expect(ok.ok, await ok.text()).toBe(true)

    expect(
      (await readPolicy(db))[key],
      'the control would keep the value it read at boot',
    ).toBe(target)

    await put({ key, value: POLICY_SETTINGS[key].fallback }, admin.cookie)
  })

  /**
   * **Loosening a bound is recorded, and not quietly.** A line filed at
   * Informational sits under every default severity filter, so the log
   * technically holds it and answers nobody.
   */
  it('records a loosened bound at a level somebody will see', async () => {
    const key = 'auth.lockoutAfterFailures'
    await put({ key, value: 5 }, admin.cookie)

    await put({ key, value: 50 }, admin.cookie)

    const lines = await db
      .select({
        event: installActivity.event,
        severity: installActivity.severityId,
        detail: installActivity.detail,
      })
      .from(installActivity)
      .where(eq(installActivity.event, 'setting_changed'))

    const loosened = lines.filter(
      (one) => one.detail?.['key'] === key && one.detail['to'] === '50',
    )
    expect(loosened.length, 'the change was not recorded at all').toBeGreaterThan(0)
    expect(
      loosened.at(-1)?.severity,
      'a loosened control was filed below High',
    ).toBeGreaterThanOrEqual(4)
    expect(loosened.at(-1)?.detail?.['from'], 'the line cannot say it was loosened').toBe('5')

    await put({ key, value: POLICY_SETTINGS[key].fallback }, admin.cookie)
  })
})

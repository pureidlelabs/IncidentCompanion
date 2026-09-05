/**
 * **The app's own rate limit, which is the second of two layers.**
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CREDENTIAL_RULES } from '../src/auth/auth.config.js'
import { TIERS } from '../src/throttle/tiers.js'
import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

const AUTH_TIER = TIERS.find((one) => one.name === 'auth')!

describe.skipIf(!runnable)('the rate limit inside the app', () => {
  let harness: Harness
  let admin: Persona

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * **The regression that takes the install down.**
   */
  it('does not apply the sign-in tier to an ordinary route', async () => {
    const answers = await Promise.all(
      Array.from({ length: AUTH_TIER.limit + 3 }, () =>
        fetch(`${harness.base}/api/settings`, { headers: { cookie: admin.cookie } }),
      ),
    )

    const refused = answers.filter((one) => one.status === 429)
    expect(
      refused.length,
      `the strict tier reached an ordinary route: ${String(refused.length)} of ${String(answers.length)} refused`,
    ).toBe(0)
  }, 60_000)

  /**
   * **The credential routes are covered by Better Auth's limiter, not by this
   * one, and that is a structural fact rather than a choice.**
   */
  it('states a credential rule for every route where a wrong answer is a guess', () => {
    for (const path of ['/sign-in/email', '/sign-up/email', '/reset-password']) {
      const rule = CREDENTIAL_RULES[path as keyof typeof CREDENTIAL_RULES]
      expect(rule, `${path} has no rule`).toBeDefined()
      expect(rule.max, `${path} allows more attempts than nginx does`).toBeLessThanOrEqual(10)
      expect(rule.window, `${path} has a window shorter than a minute`).toBeGreaterThanOrEqual(60)
    }
  })

  /**
   * **The session read must not be in that list.** It fires on every page
   * load; a credential-shaped limit on it signs an analyst out mid-case.
   */
  it('does not put a credential rule on the session read', () => {
    expect(Object.keys(CREDENTIAL_RULES)).not.toContain('/get-session')
  })
})

/**
 * **The app's own rate limit, which is the second of two layers.**
 *
 * nginx stops a flood arriving from outside and knows only a path; this one is
 * inside the session and knows the route and the tier. The outer layer is not
 * in this process at all, so everything here is testing the inner one alone.
 *
 * **Two failures, opposite and both severe.**
 *
 * - The strict sign-in tier reaching ordinary routes. Every configured tier is
 *   evaluated on every request, so an unscoped `auth` tier holds the whole
 *   install to five requests per fifteen minutes and it stops working on the
 *   sixth click. That is what the first case here is for.
 * - The limit keyed on the proxy rather than the caller. Not reachable in this
 *   process - there is no nginx in front of it - so it is held by
 *   `src/throttle/caller.test.ts` instead, and named here so the gap is not
 *   mistaken for coverage.
 *
 * **And the credential routes are not this limiter's at all.** Better Auth is
 * mounted as middleware, which runs before guards, so `APP_GUARD` never sees
 * `/api/auth/*`. Those are covered by Better Auth's own limiter and asserted
 * here as configuration - see the last two cases for what that cannot show.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CREDENTIAL_RULES } from '../src/auth/auth.config.js'
import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

/**
 * More than any credential-shaped tier would allow, and far under `api`'s 300
 * a minute. A literal rather than a tier's own limit: what this guards is that
 * no tier refuses an ordinary route at this volume, and reading the number off
 * a tier makes the test agree with whatever that tier says.
 */
const MORE_THAN_A_CREDENTIAL_TIER = 8

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
   * **The regression that takes the install down.** A credential-shaped tier
   * reaching an ordinary route refuses the sixth request and every screen in
   * the app breaks with it. There is no such tier now -- the one that existed
   * could never fire and was removed (#190) -- so this is the case that would
   * notice a new one arriving unscoped.
   */
  it('does not refuse an ordinary route at a credential volume', async () => {
    const answers = await Promise.all(
      Array.from({ length: MORE_THAN_A_CREDENTIAL_TIER }, () =>
        fetch(`${harness.base}/api/settings`, { headers: { cookie: admin.cookie } }),
      ),
    )

    const refused = answers.filter((one) => one.status === 429)
    expect(
      refused.length,
      `a tier reached an ordinary route: ${String(refused.length)} of ${String(answers.length)} refused`,
    ).toBe(0)
  }, 60_000)

  /**
   * **The credential routes are covered by Better Auth's limiter, not by this
   * one, and that is a structural fact rather than a choice.**
   * `@thallesp/nestjs-better-auth` mounts Better Auth with
   * `consumer.apply(...).forRoutes('*path')`; middleware runs before guards,
   * so `APP_GUARD` never sees `/api/auth/*`. A throttler tier aimed at them
   * would be configuration nothing reads.
   *
   * **What this cannot assert, said rather than faked.** Better Auth gates its
   * limiter on production, and the rule keys on the address - the whole suite
   * is one address, so enabling it here would refuse the harness's own
   * sign-ins and fail files that have nothing to do with rate limiting. So the
   * rules are checked as configuration, and whether the limiter enforces them
   * is Better Auth's own test rather than this one.
   */
  it('states a credential rule for every route where a wrong answer is a guess', () => {
    // Named here, not read off `CREDENTIAL_RULES`: a loop over the object
    // under test shrinks when a rule is deleted and stays green, which is how
    // `/forget-password` and `/change-password` came to be asserted by nothing.
    const GUESSABLE = [
      '/sign-in/email',
      '/sign-up/email',
      '/forget-password',
      '/reset-password',
      '/change-password',
    ]
    expect(
      Object.keys(CREDENTIAL_RULES).sort(),
      'a credential rule was added or removed without this list',
    ).toEqual([...GUESSABLE].sort())

    for (const path of GUESSABLE) {
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

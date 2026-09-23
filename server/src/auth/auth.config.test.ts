/**
 * That a session actually expires when nobody is using it.
 *
 * **Asserted as bounds rather than as numbers.** The windows are the install's
 * to set, and what may never happen again is a session silently becoming a
 * lifetime - which is what an absent `session` block is.
 *
 * **Nothing here expires a real session.** These read `auth.options`, so a
 * library that stopped honouring `expiresIn` would leave every case green.
 */
import { describe, expect, it } from 'vitest'
// Re-exported by `better-auth/api`, which is a declared dependency;
// `@better-auth/core` resolves only by hoisting and is not in package.json.
import { getIP } from 'better-auth/api'

import { createAuth } from './auth.config.js'
import { MINIMUM_PASSWORD_LENGTH } from './password-policy.js'
import { ADDRESS_RULE } from '../wire/caller-address.js'
import {
  SESSION_IDLE_CEILING_MINUTES,
  SESSION_LIFETIME_CEILING_MINUTES,
} from '../policy/keys.js'

/** Nothing here reads or writes; the adapter is only constructed. */
const db = {} as never

const auth = createAuth(db, 'not-a-real-secret-for-tests', 'https://127.0.0.1:8124')

describe('how long a session outlives the analyst', () => {
  /**
   * **`expiresIn` is the cookie, not the window.** The idle window and the
   * lifetime are settings, written onto the row by `windowFor`, so what is
   * asserted here is the two bounds the cookie owes them: it may not die
   * before the longest session an install can set, which puts the analyst at a
   * sign-in screen while the server still holds them signed in, and it may not
   * outlive the longest one either.
   * -> `test/the-install-sets-both-windows.test.ts`
   */
  it('issues the cookie for neither less nor more than the install can set', () => {
    const expiresIn = auth.options.session?.expiresIn
    expect(expiresIn, 'no session block means Better Auth\u2019s 7-day default').toBeDefined()
    expect(expiresIn).toBeGreaterThanOrEqual(SESSION_IDLE_CEILING_MINUTES * 60)
    expect(expiresIn).toBeLessThanOrEqual(SESSION_LIFETIME_CEILING_MINUTES * 60)
  })

  /**
   * **Zero, not merely small.** Better Auth refreshes only once `updateAge` has
   * passed, and the one read that refreshes here is the browser's activity
   * report - already throttled to one a minute. Any non-zero value on top of
   * that throttle means a report can arrive with nothing to do, which answers
   * no cookie and leaves the browser's copy of the window running out on its
   * own. -> `test/the-idle-window-reaches-the-browser.test.ts`
   */
  it('refreshes on the read rather than on a second throttle', () => {
    expect(auth.options.session?.updateAge).toBe(0)
  })
})

/**
 * Whether a caller can choose their own brute-force budget. Better Auth keys
 * its limiter on `createRateLimitKey(getIP(...) ?? NO_TRUSTED_IP_KEY, path)`,
 * so moving `getIP`'s answer is moving the bucket.
 *
 * Only `x-forwarded-for` is read, and only after the platform layer has
 * rewritten it; `test/a-caller-is-attributed-to-itself.test.ts` holds that
 * half. Every other spelling is a bypass if it is ever read.
 */
describe('who the rate limiter thinks is calling', () => {
  it.each(['x-real-ip', 'cf-connecting-ip', 'forwarded', 'true-client-ip'])(
    'will not let %s pick the bucket',
    (header) => {
      const one = getIP(new Headers({ [header]: '9.9.9.9' }), auth.options)
      const two = getIP(new Headers({ [header]: '8.8.8.8' }), auth.options)

      expect(one, 'the caller chose their own rate-limit bucket').not.toBe('9.9.9.9')
      expect(one, 'two presented addresses resolve differently').toBe(two)
    },
  )

  it('reads the rule every other reader of the address reads', () => {
    expect(auth.options.advanced.ipAddress).toBe(ADDRESS_RULE)
  })

  /**
   * `disableIpTracking` reads like a privacy switch and is not one:
   * `if (!ip && disableIpTracking) return null` in the rate limiter means no
   * rule applies at all. Nothing sets it; this fails if anything starts.
   */
  it('does not switch rate limiting off in the name of privacy', () => {
    // Read through a cast: the options object is a literal, so while nothing
    // sets `disableIpTracking` the inferred type has no such property and a
    // direct read is a compile error rather than a passing assertion.
    const ip = auth.options.advanced?.ipAddress as { disableIpTracking?: boolean } | undefined
    expect(ip?.disableIpTracking).toBeFalsy()
  })
})

/**
 * **Half of "core makes no outbound request", and the half a config can hold.**
 * The other half is the environment: enablement is
 * `getBooleanEnvVar('BETTER_AUTH_TELEMETRY', false) || telemetry.enabled`, so
 * `BETTER_AUTH_TELEMETRY=1` beats this setting and only the stack's own
 * environment can refuse that. Asserted where it is decidable.
 */
describe('what the auth layer sends home', () => {
  it('declares telemetry off rather than inheriting the default', () => {
    expect(
      auth.options.telemetry?.enabled,
      'unset means a prerelease bump decides this, and the no-outbound-request ' +
        'rule is not a third party\u2019s to revise',
    ).toBe(false)
  })
})

/**
 * **The library serves a second change-password route, and it is the weaker
 * one unless told otherwise.** With `minPasswordLength` unset, Better Auth's
 * default of 8 governs its own doors: measured live, the app's own route
 * refused an 8-character password with 422 while
 * `POST /api/auth/change-password` accepted it with 200 and signing in with it
 * worked.
 *
 * **A route this codebase never calls is still a route**, so what the client
 * happens to call is not the control.
 */
describe('the password policy, across both doors', () => {
  it('tells the library the same minimum the app enforces', () => {
    expect(auth.options.emailAndPassword?.minPasswordLength).toBe(MINIMUM_PASSWORD_LENGTH)
  })

  /**
   * The other half. A minimum both sides agree on is worth nothing if the
   * number itself drifts down, and 12 is the one this app's screens promise.
   */
  it('holds the minimum at twelve', () => {
    expect(MINIMUM_PASSWORD_LENGTH).toBe(12)
  })

  // That every request schema reads this constant rather than repeating the
  // number is asserted over the source, in
  // `tests/repo/test_source_hygiene.py` -- the schemas are module-private and
  // exporting three of them to be counted here would be the test shaping the
  // code.
})

/**
 * That a session actually expires when nobody is using it.
 */
import { describe, expect, it } from 'vitest'
// Re-exported by `better-auth/api`, which is a declared dependency;
// `@better-auth/core` resolves only by hoisting and is not in package.json.
import { getIP } from 'better-auth/api'

import { createAuth } from './auth.config.js'
import { MINIMUM_PASSWORD_LENGTH } from './password-policy.js'
import {
  SESSION_IDLE_CEILING_MINUTES,
  SESSION_LIFETIME_CEILING_MINUTES,
} from '../policy/keys.js'

/** Nothing here reads or writes; the adapter is only constructed. */
const db = {} as never

const auth = createAuth(db, 'not-a-real-secret-for-tests', 'https://127.0.0.1:8124')

describe('how long a session outlives the analyst', () => {
  /**
   * **`expiresIn` is the cookie, not the window.**
   */
  it('issues the cookie for neither less nor more than the install can set', () => {
    const expiresIn = auth.options.session?.expiresIn
    expect(expiresIn, 'no session block means Better Auth\u2019s 7-day default').toBeDefined()
    expect(expiresIn).toBeGreaterThanOrEqual(SESSION_IDLE_CEILING_MINUTES * 60)
    expect(expiresIn).toBeLessThanOrEqual(SESSION_LIFETIME_CEILING_MINUTES * 60)
  })

  /**
   * **Zero, not merely small.**
   */
  it('refreshes on the read rather than on a second throttle', () => {
    expect(auth.options.session?.updateAge).toBe(0)
  })
})

/**
 * Whether a caller can choose their own brute-force budget.
 */
describe('who the rate limiter thinks is calling', () => {
  /**
   * **Every spelling except the one the proxy controls.**
   */
  it.each(['x-forwarded-for', 'cf-connecting-ip', 'forwarded', 'true-client-ip'])(
    'will not let a forged %s pick the bucket',
    (header) => {
      const one = getIP(new Headers({ [header]: '9.9.9.9' }), auth.options)
      const two = getIP(new Headers({ [header]: '8.8.8.8' }), auth.options)

      expect(one, 'the caller chose their own rate-limit bucket').not.toBe('9.9.9.9')
      expect(two, 'the caller chose their own rate-limit bucket').not.toBe('8.8.8.8')
      expect(
        one,
        'two forged headers resolve differently, so a caller gets a fresh ' +
          'brute-force budget per request by varying one header',
      ).toBe(two)
    },
  )

  it('trusts exactly the one header the proxy overwrites', () => {
    /**
     * The list itself, because the assertions above can only refuse the
     * spellings they happen to enumerate -- and because adding a second entry
     * here would reintroduce the bypass without changing any of them.
     */
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(['x-real-ip'])
  })

  /**
   * **The trust is a property of the topology, so it may not outlive it.**
   */
  describe('outside production', () => {
    const dev = createAuth(db, 'not-a-real-secret-for-tests', 'http://127.0.0.1:8124', 'development')

    it('trusts no client-IP header, because nothing sanitises them there', () => {
      expect(dev.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([])
    })

    it('will not let a forged x-real-ip pick the bucket', () => {
      const one = getIP(new Headers({ 'x-real-ip': '9.9.9.9' }), dev.options)
      const two = getIP(new Headers({ 'x-real-ip': '8.8.8.8' }), dev.options)

      expect(one).not.toBe('9.9.9.9')
      expect(one, 'a dev caller picks their own brute-force budget').toBe(two)
    })
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
 * **Half of "core makes no outbound request", and the half a config can
 * hold.**
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
 * **The library serves a second change-password route, and it was the weaker
 * one.**
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

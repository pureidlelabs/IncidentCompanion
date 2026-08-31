/**
 * The lockout arithmetic, attacked: can a run of guesses stay under it?
 *
 * These are not "does it count to ten". Each one is a way the control fails
 * open while looking correct:
 *
 * - a stored setting turning the threshold off,
 * - a lock that re-arms itself on every attempt and so never reports when it
 *   shut,
 * - an expired lock leaving the counter at zero, which hands the attacker a
 *   fresh allowance every fifteen minutes,
 * - a boundary that locks at the wrong attempt.
 */
import { describe, expect, it } from 'vitest'

import {
  CLEARED,
  LOCKOUT_AFTER_FAILURES,
  LOCKOUT_CEILING_FAILURES,
  LOCKOUT_FLOOR_MINUTES,
  LOCKOUT_MINUTES,
  afterFailure,
  isLocked,
  policyFrom,
} from './lockout.js'

const NOW = new Date('2026-08-23T12:00:00Z')
const POLICY = { afterFailures: LOCKOUT_AFTER_FAILURES, minutes: LOCKOUT_MINUTES }
const open = { failedSignIns: 0, lockedUntil: null }

describe('the lockout policy', () => {
  it('falls back to the default when nothing is stored', () => {
    expect(policyFrom({})).toEqual(POLICY)
  })

  it('takes a stored value that is inside the bounds', () => {
    expect(policyFrom({ afterFailures: 5, minutes: 30 })).toEqual({
      afterFailures: 5,
      minutes: 30,
    })
  })

  /**
   * **A setting is a write path, so it is an attack surface.** A threshold of
   * a million turns the control off while the screen still shows a number,
   * which is worse than having no setting: the install believes it is
   * protected.
   */
  it.each([
    ['above the ceiling', { afterFailures: LOCKOUT_CEILING_FAILURES + 1 }],
    ['zero', { afterFailures: 0 }],
    ['negative', { afterFailures: -1 }],
    ['fractional', { afterFailures: 2.5 }],
    ['not a number', { afterFailures: 'lots' }],
    ['null', { afterFailures: null }],
  ])('refuses a threshold that is %s', (_why, stored) => {
    expect(policyFrom(stored).afterFailures).toBe(LOCKOUT_AFTER_FAILURES)
  })

  it.each([
    ['under the floor', { minutes: LOCKOUT_FLOOR_MINUTES - 1 }],
    ['zero', { minutes: 0 }],
    ['negative', { minutes: -60 }],
  ])('refuses a duration that is %s', (_why, stored) => {
    expect(policyFrom(stored).minutes).toBe(LOCKOUT_MINUTES)
  })
})

describe('one more failure', () => {
  /**
   * **The boundary, from both sides.** Locking one attempt late gives every
   * attacker a free guess; one early locks an analyst who can still count.
   */
  it('leaves the account open until the last allowed failure', () => {
    const state = { failedSignIns: POLICY.afterFailures - 2, lockedUntil: null }

    const next = afterFailure(state, POLICY, NOW)

    expect(next.failedSignIns).toBe(POLICY.afterFailures - 1)
    expect(next.lockedUntil).toBeNull()
    expect(next.justLocked).toBe(false)
  })

  it('shuts the account on the failure that reaches the threshold', () => {
    const state = { failedSignIns: POLICY.afterFailures - 1, lockedUntil: null }

    const next = afterFailure(state, POLICY, NOW)

    expect(next.failedSignIns).toBe(POLICY.afterFailures)
    expect(next.lockedUntil).toEqual(new Date(NOW.getTime() + POLICY.minutes * 60_000))
    expect(next.justLocked).toBe(true)
  })

  /**
   * **Shut is not newly shut.** A caller recording a line on every attempt
   * against a locked account buries the one line saying when it shut - and
   * hands an attacker a way to flood the audit by keeping on guessing.
   */
  it('does not report a second lock while the first still stands', () => {
    const shut = {
      failedSignIns: POLICY.afterFailures,
      lockedUntil: new Date(NOW.getTime() + 60_000),
    }

    const next = afterFailure(shut, POLICY, NOW)

    expect(next.justLocked, 'an already-shut account re-reported as newly shut').toBe(false)
  })

  /**
   * **The counter is consecutive, and time does not clear it.** If an expired
   * lock reset the count, an attacker would get a fresh full allowance every
   * window - ten guesses every fifteen minutes, forever, which is not a
   * lockout but a rate limit with extra steps.
   */
  it('shuts again on the first failure after a lock expires', () => {
    const expired = {
      failedSignIns: POLICY.afterFailures,
      lockedUntil: new Date(NOW.getTime() - 1),
    }

    const next = afterFailure(expired, POLICY, NOW)

    expect(next.lockedUntil?.getTime()).toBe(NOW.getTime() + POLICY.minutes * 60_000)
    expect(next.justLocked, 'an expired lock re-shutting is a new lock').toBe(true)
  })
})

describe('whether an account is shut', () => {
  it('is open when it has never been locked', () => {
    expect(isLocked(open, NOW)).toBe(false)
  })

  it('is shut while the lock stands', () => {
    expect(isLocked({ failedSignIns: 10, lockedUntil: new Date(NOW.getTime() + 1) }, NOW)).toBe(true)
  })

  /**
   * **Exactly at the expiry the account is open.** A lock that outlives its
   * own timestamp by a millisecond is a lock nobody can predict the end of.
   */
  it('is open at the instant the lock expires', () => {
    expect(isLocked({ failedSignIns: 10, lockedUntil: new Date(NOW.getTime()) }, NOW)).toBe(false)
  })

  it('is open once a success has cleared it', () => {
    expect(isLocked(CLEARED, NOW)).toBe(false)
    expect(CLEARED.failedSignIns, 'a success must clear the count, not only the lock').toBe(0)
  })
})

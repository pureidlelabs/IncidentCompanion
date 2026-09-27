/**
 * The lockout arithmetic, attacked: can a run of guesses stay under it, or
 * can what it keeps give a guess away?
 */
import { describe, expect, it } from 'vitest'

import { defaultPolicy } from '../policy/read.js'
import { isLocked, missOf, policyFrom } from './lockout.js'

const NOW = new Date('2026-08-23T12:00:00Z')

describe('the lockout policy', () => {
  /**
   * A maximum set below the first lock would make every lock shorter than
   * the install asked the first one to be.
   */
  it('never lets the longest lock fall below the first', () => {
    const policy = policyFrom({
      ...defaultPolicy(),
      'auth.lockoutMinutes': 60,
      'auth.lockoutMaxMinutes': 30,
    })
    expect(policy.maxMinutes).toBe(60)
  })
})

describe('whether a run is shut', () => {
  it('is open when it has never been locked', () => {
    expect(isLocked(null, NOW)).toBe(false)
  })

  it('is shut while the lock stands', () => {
    expect(isLocked(new Date(NOW.getTime() + 1), NOW)).toBe(true)
  })

  /** A lock that outlives its own timestamp is one nobody can predict the end of. */
  it('is open at the instant the lock expires', () => {
    expect(isLocked(new Date(NOW.getTime()), NOW)).toBe(false)
  })
})

describe('what a run keeps of a wrong password', () => {
  const SECRET = 'an-install-secret-long-enough-to-pass'

  it('recognises the same password at the same account', () => {
    expect(missOf(SECRET, 'account-a', 'hunter2')).toBe(missOf(SECRET, 'account-a', 'hunter2'))
  })

  it('never holds the password itself', () => {
    expect(missOf(SECRET, 'account-a', 'hunter2-is-the-guess')).not.toContain('hunter2')
  })

  /**
   * One guess tried against two accounts must not be visible as the same
   * guess in the store, or the rows name which accounts one guesser tried.
   */
  it('keeps one guess at two accounts as two unrelated values', () => {
    expect(missOf(SECRET, 'account-a', 'hunter2')).not.toBe(missOf(SECRET, 'account-b', 'hunter2'))
  })

  /** Without the install's secret, the stored value confirms no guess. */
  it("depends on the install's secret", () => {
    expect(missOf(SECRET, 'account-a', 'hunter2')).not.toBe(missOf(`${SECRET}-other`, 'account-a', 'hunter2'))
  })
})

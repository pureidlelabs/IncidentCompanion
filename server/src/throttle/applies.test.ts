/**
 * Which tier applies where, attacked from both ends.
 *
 * - Too wide: the strict tier reaches an ordinary route and the install stops
 *   working on the sixth request. Five per fifteen minutes, for everything.
 * - Too narrow: a credential route is not covered and the layer that was
 *   supposed to stop a password run does nothing.
 */
import { describe, expect, it } from 'vitest'

import { isCredentialAttempt, tierApplies } from './applies.js'

describe('what counts as a credential attempt', () => {
  it.each([
    '/api/auth/sign-in/email',
    '/api/auth/sign-in',
    '/api/auth/sign-up/email',
    '/api/auth/reset-password',
    '/api/auth/forget-password',
    '/api/auth/change-password',
  ])('covers %s', (path) => {
    expect(isCredentialAttempt(path)).toBe(true)
  })

  /**
   * **The session read is the dangerous false positive.** Every page load
   * calls it; five per fifteen minutes would sign the analyst out mid-case.
   */
  it('does not cover the session read', () => {
    expect(
      isCredentialAttempt('/api/auth/get-session'),
      'the strict tier would log an analyst out on their sixth page load',
    ).toBe(false)
  })

  it.each(['/api/auth/sign-out', '/api/cases', '/api/install/activity', '/'])(
    'does not cover %s',
    (path) => {
      expect(isCredentialAttempt(path)).toBe(false)
    },
  )

  it('matches a segment rather than a string prefix', () => {
    expect(isCredentialAttempt('/api/auth/sign-invitation')).toBe(false)
  })

  /** And a lookalike outside the mount point is not one either. */
  it('is not fooled by a path that merely contains the prefix', () => {
    expect(isCredentialAttempt('/api/cases/api/auth/sign-in')).toBe(false)
  })
})

describe('which tier applies', () => {
  /**
   * **The one that would take the install down.** If this ever returns true
   * for an ordinary route, everything breaks on the sixth request.
   */
  it('keeps the strict tier off ordinary routes', () => {
    expect(tierApplies('auth', '/api/cases'), 'the strict tier reached a working route').toBe(false)
  })

  it('applies the strict tier to a credential attempt', () => {
    expect(tierApplies('auth', '/api/auth/sign-in/email')).toBe(true)
  })

  /**
   * **The general tiers apply everywhere, sign-in included.**
   */
  it.each(['api', 'burst', undefined])('applies the %s tier everywhere', (tier) => {
    expect(tierApplies(tier, '/api/cases')).toBe(true)
    expect(tierApplies(tier, '/api/auth/sign-in/email')).toBe(true)
  })
})

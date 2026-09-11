/**
 * Which tier applies where, attacked from both ends.
 *
 * **Both mistakes here are severe and neither is subtle after the fact.**
 *
 * - Too wide: a strict tier reaches an ordinary route and the install stops
 *   working on the sixth request.
 * - Unreachable: a tier scoped to paths no guard runs on, which answers
 *   *allowed* every time while its prose reads as a defence. That is what
 *   happened to the credential tier, and the first block below is what refuses
 *   the next one. -> #190
 *
 * Which paths a credential rule covers, and that the session read is not one
 * of them, is `test/rate-limit.test.ts`'s -- the rules are Better Auth's.
 */
import { describe, expect, it } from 'vitest'

import { tierApplies } from './applies.js'
import { TIERS } from './tiers.js'

/**
 * Paths this app's own controllers answer, so the guard genuinely runs on them.
 *
 * `/api/auth/*` is deliberately absent: Better Auth is mounted as middleware
 * and middleware runs before guards, so no tier is ever consulted there.
 */
const REACHABLE = [
  '/api/cases',
  '/api/settings',
  '/api/accounts',
  '/api/customers',
  '/api/health',
]

describe('every tier the throttler is configured with', () => {
  /**
   * A tier scoped only to paths the guard cannot see is evaluated on every
   * request and answers *allowed* every time, while its own prose reads as a
   * live defence. That is worse than no tier: it is the one somebody points at
   * when they weaken the control that is actually doing the work.
   */
  it.each(TIERS.map((one) => one.name))('%s can apply to a path the guard sees', (name) => {
    expect(
      REACHABLE.some((path) => tierApplies(name, path)),
      'this tier applies only under /api/auth, which no guard is ever reached on',
    ).toBe(true)
  })
})

describe('which tier applies', () => {
  it.each(['api', 'burst', undefined])('applies the %s tier everywhere', (tier) => {
    expect(tierApplies(tier, '/api/cases')).toBe(true)
    expect(tierApplies(tier, '/api/auth/sign-in/email')).toBe(true)
  })
})

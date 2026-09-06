/**
 * That the install cannot be left with nobody who can administer it.
 *
 * **Two routes can do it, and one of them is not this app's.** `POST
 * /api/accounts/:username/disable` asks the rule; changing a role happens
 * through Better Auth's own `/api/auth/admin/set-role`, which no app code
 * gates. Unguarded, an admin demotes itself to `analyst`, gets 200, and is
 * refused `/api/accounts` on the next request -- reproduced.
 *
 * **Unrecoverable, which is why it is worth a guard rather than a warning.**
 * Nothing in the product can promote anybody once there are no admins -- no
 * account creation, no password reset, no enable, no role change. The health
 * screen already warns on `admins === 0`, so the product knows the state is
 * bad and nothing prevented reaching it.
 */
import { describe, expect, it } from 'vitest'

import { stranding, type Analyst } from './last-admin.js'

const admin: Analyst = { id: 'a', email: 'a@x.test', name: 'A', role: 'admin' }
const second: Analyst = { id: 'b', email: 'b@x.test', name: 'B', role: 'admin' }
const ordinary: Analyst = { id: 'c', email: 'c@x.test', name: 'C', role: 'analyst' }
const bannedAdmin: Analyst = { ...second, banned: true }

describe('demoting the last administrator', () => {
  it('refuses when the target is the only one able to administer', () => {
    expect(stranding([admin, ordinary], admin, 'analyst')).toBe(true)
  })

  it('allows it while another enabled admin remains', () => {
    expect(stranding([admin, second], admin, 'analyst')).toBe(false)
  })

  it('does not count a banned admin as the one who would remain', () => {
    expect(stranding([admin, bannedAdmin], admin, 'analyst')).toBe(true)
  })

  /**
   * **The half that makes this a demotion rule and not a copy of the disable
   * rule.** Setting the last admin's role to `admin` again strands nobody, and
   * refusing it would make a no-op look like a dangerous act.
   */
  it('allows setting the last admin to the role it already has', () => {
    expect(stranding([admin, ordinary], admin, 'admin')).toBe(false)
  })

  it('says nothing about an account that is not an admin', () => {
    expect(stranding([admin, ordinary], ordinary, 'admin')).toBe(false)
    expect(stranding([admin, ordinary], ordinary, 'analyst')).toBe(false)
  })

  /** An install with no admins at all refuses nothing; there is nothing left to protect. */
  it('refuses nothing when there is already no administrator', () => {
    expect(stranding([ordinary], ordinary, 'analyst')).toBe(false)
  })
})

/**
 * Moved with the rule from `accounts/rules.test.ts`. `disable` is a demotion
 * to nobody, so it asks the same question with `null`.
 */
describe('disabling the last administrator', () => {
  it('is refused when they are the only one who can sign in', () => {
    expect(stranding([admin, ordinary], admin, null)).toBe(true)
  })

  it('is allowed when another administrator can still sign in', () => {
    expect(stranding([admin, second], admin, null)).toBe(false)
  })

  it('does not count an administrator who is already disabled', () => {
    // An account that cannot sign in cannot administer anything, so a banned
    // admin is not the second one that makes this safe.
    expect(stranding([admin, bannedAdmin], admin, null)).toBe(true)
  })

  it('does not fire on an ordinary analyst while one administrator exists', () => {
    // **The early return, and this is the only arrangement that catches its
    // loss.** With exactly one admin on the install, the survivor count is 1 -
    // so dropping the target-is-an-admin check refuses disabling an *ordinary*
    // analyst as "the last administrator".
    //
    // Written this way after a break-verify: the same test against an install
    // holding no admins passes either way, because the count is 0 there and
    // the mutation is unobservable. A case that cannot fail is worse than no
    // case, because its name claims the clause is covered.
    expect(stranding([admin, ordinary], ordinary, null)).toBe(false)
  })

  it('does not fire on an install with no administrators at all', () => {
    const other: Analyst = { id: 'd', email: 'd@x.test', name: 'D', role: 'analyst' }
    expect(stranding([ordinary, other], ordinary, null)).toBe(false)
  })

  it('does not fire on an administrator who is already disabled', () => {
    // Disabling a disabled account changes nothing, so there is nothing to
    // refuse - and counting them would refuse re-disabling the only admin.
    expect(stranding([bannedAdmin, ordinary], bannedAdmin, null)).toBe(false)
  })
})

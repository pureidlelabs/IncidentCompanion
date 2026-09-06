/**
 * The role a new account is created with.
 *
 * Held as a named function because the hook it lives in needs a database and a
 * Better Auth instance to reach, and the decision does not.
 *
 * **So none of this proves the hook calls it.** `test/analyst-privilege.test.ts`
 * covers the wiring for the default path - first account administrator, second
 * analyst - and nothing covers the branch the defect was in: an administrator
 * asking for `admin` and getting it.
 */
import { describe, expect, it } from 'vitest'

import { ADMIN_ROLE, DEFAULT_ROLE, roleForNewUser } from './auth.config.js'

describe('the role a new account is created with', () => {
  it('makes the first account the administrator, whatever it asked for', () => {
    expect(roleForNewUser(undefined, false)).toBe(ADMIN_ROLE)
    expect(roleForNewUser('analyst', false)).toBe(ADMIN_ROLE)
  })

  it('grants the role an administrator asked for', () => {
    expect(roleForNewUser('admin', true)).toBe(ADMIN_ROLE)
  })

  it('defaults when the caller named none', () => {
    expect(roleForNewUser(undefined, true)).toBe(DEFAULT_ROLE)
    expect(roleForNewUser('', true)).toBe(DEFAULT_ROLE)
  })

  /**
   * A role nothing checks against is worse than the default: every guard reads
   * `role === 'admin'`, so an unknown value is an account with no rung at all.
   */
  it.each(['administrator', 'ADMIN', 'root', 'analyst ', 42, null])(
    'falls back rather than writing %s',
    (asked) => {
      expect(roleForNewUser(asked, true)).toBe(DEFAULT_ROLE)
    },
  )
})

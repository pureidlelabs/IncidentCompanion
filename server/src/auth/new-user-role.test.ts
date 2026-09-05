/**
 * The role a new account is created with.
 */
import { describe, expect, it } from 'vitest'

import { ADMIN_ROLE, DEFAULT_ROLE, roleForNewUser } from './auth.config.js'

describe('the role a new account is created with', () => {
  /** An install with nobody in it has to become claimable exactly once. */
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

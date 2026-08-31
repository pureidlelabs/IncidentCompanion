import { describe, expect, it } from 'vitest'

import { matchesAccount, type AccountRow } from './account-table'

/**
 * **The accounts search reads both lines of the Account column, and nothing
 * else.**
 *
 * The name and the username sit in one cell, so matching both is the column,
 * not a widening; Role and State are their own columns and are not searched.
 *
 * Written from the attack: the assertion that matters is the negative one.
 */

const person: AccountRow = {
  id: 'a1',
  username: 'r.okonkwo',
  displayName: 'Rachel Okonkwo',
  role: 'admin',
  state: 'active',
}

describe('the accounts search reads both lines of the Account column', () => {
  it('matches the name the cell leads with', () => {
    expect(matchesAccount(person, 'rachel')).toBe(true)
  })

  it('matches the username under it, which the same cell draws', () => {
    expect(matchesAccount(person, 'r.okonkwo')).toBe(true)
  })

  it('refuses a value that is only in the Role column', () => {
    expect(matchesAccount(person, 'admin')).toBe(false)
  })

  it('refuses a value that is only in the State column', () => {
    expect(matchesAccount(person, 'active')).toBe(false)
  })
})

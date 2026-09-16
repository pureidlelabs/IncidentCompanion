import { describe, expect, it } from 'vitest'

import { ACCOUNT_STATES } from '@contract/analyst-account'

import { ACCOUNT_TABS, matchesAccount, type AccountTableRow } from './account-table'

/**
 * **The accounts search reads both lines of the Account column, and nothing
 * else.**
 *
 * The name and the username sit in one cell, so matching both is the column,
 * not a widening; Role and State are their own columns and are not searched.
 *
 * Written from the attack: the assertion that matters is the negative one.
 */

const person: AccountTableRow = {
  id: 'a1',
  username: 'r.okonkwo',
  displayName: 'Rachel Okonkwo',
  role: 'admin',
  state: 'active',
  you: false,
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

/**
 * The pane narrows by state with a tab each, and the list is hand-kept while
 * the states are served.
 *
 * A state the server grows and this does not is the quiet failure: the rows
 * are fetched, drawn and counted under All, and reachable from no other tab.
 * Nothing renders wrong, so nothing reports it.
 */
describe('the state tabs', () => {
  it('offer every state an account is served in', () => {
    const offered = ACCOUNT_TABS.filter((name) => name !== 'All').map((name) => name.toLowerCase())

    expect([...offered].sort(), 'a served state with no tab is reachable from All alone').toEqual(
      [...ACCOUNT_STATES].sort(),
    )
  })
})

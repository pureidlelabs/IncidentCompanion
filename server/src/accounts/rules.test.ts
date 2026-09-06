/**
 * The two decisions the Accounts pane owns.
 *
 * **Written from the failure each one prevents**, not from the happy path: an
 * install that nobody can administer, and a chip whose state disagrees with the
 * flag beside it.
 */
import { describe, expect, it } from 'vitest'

import { rowFor, type Analyst } from './rules.js'

function analyst(over: Partial<Analyst> = {}): Analyst {
  return { id: 'u-1', email: 'a@example.test', name: 'A', role: 'analyst', ...over }
}

describe('the row the pane draws', () => {
  it('resolves the state and the tone, so the client derives neither', () => {
    expect(rowFor(analyst())).toEqual({
      username: 'a@example.test',
      displayName: 'A',
      role: 'analyst',
      state: 'active',
      tone: 'positive',
      disabled: false,
    })
  })

  it('says disabled when the account is banned', () => {
    const row = rowFor(analyst({ banned: true }))
    expect([row.state, row.tone, row.disabled]).toEqual(['disabled', 'negative', true])
  })

  it('reads a roleless row as the default, not as nothing', () => {
    // Only a row written outside the plugin has no role - an account seeded by
    // hand, or one from before the plugin was enabled. Unprivileged is the safe
    // direction to be wrong in.
    expect(rowFor(analyst({ role: null })).role).toBe('analyst')
  })

  it('never claims a state the server cannot produce', () => {
    // Better Auth has no per-account lock, so anything serving a "locked out"
    // chip here would be inventing it. Stated as a test because the pane
    // renders that state from its own fixtures quite happily.
    const states = [rowFor(analyst()), rowFor(analyst({ banned: true }))].map((one) => one.state)
    expect(states).not.toContain('locked out')
  })
})


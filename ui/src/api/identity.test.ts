/**
 * The identity the boot adopts from the session probe keeps the evaluation
 * build's mark, and carries none for an account.
 */
import { describe, expect, it } from 'vitest'

import { identityFrom } from './client'

describe('the identity read from a probed user', () => {
  it('carries the demo mark the evaluation build sets on its analyst', () => {
    expect(
      identityFrom({ id: 'demo', name: 'Demo analyst', email: 'demo@example.invalid', demo: true }),
    ).toEqual({
      userId: 'demo',
      username: 'Demo analyst',
      demo: true,
    })
  })

  it('carries no mark for an account, and none for a mark that is not true', () => {
    expect(identityFrom({ id: 'u1', name: 'r.okonkwo', email: 'r@example.test' })).toEqual({
      userId: 'u1',
      username: 'r.okonkwo',
    })
    expect(identityFrom({ id: 'u1', name: null, email: 'r@example.test', demo: false })).toEqual({
      userId: 'u1',
      username: 'r@example.test',
    })
  })
})

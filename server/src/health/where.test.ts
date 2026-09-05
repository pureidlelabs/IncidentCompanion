/**
 * Asserts which of the three words a URL resolves to, and that no hostname
 * survives into the answer.
 */
import { describe, expect, it } from 'vitest'

import { whereIs } from './where.js'

describe('where a dependency lives', () => {
  it('calls the loopback names local', () => {
    expect(whereIs('postgres://u:p@127.0.0.1:5432/db')).toBe('this machine')
    expect(whereIs('postgres://u:p@localhost:5432/db')).toBe('this machine')
    expect(whereIs('redis://[::1]:6379')).toBe('this machine')
  })

  /**
   * **A container name is not this machine, and that is the case worth getting
   * right.**
   */
  it('calls a container or a host elsewhere', () => {
    expect(whereIs('postgres://u:p@postgres:5432/db')).toBe('elsewhere')
    expect(whereIs('redis://cache.internal:6379')).toBe('elsewhere')
    expect(whereIs('postgres://u:p@10.0.1.7:5432/db')).toBe('elsewhere')
  })

  /**
   * **Unparseable answers "unknown", never "this machine".**
   */
  it('says unknown rather than guessing when it cannot tell', () => {
    expect(whereIs('')).toBe('unknown')
    expect(whereIs('not a url')).toBe('unknown')
  })
})

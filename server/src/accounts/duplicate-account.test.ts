/**
 * **Creating an account that already exists is a refusal, not a 500.**
 */
import { describe, expect, it } from 'vitest'

import { duplicateEmail } from './rules.js'

describe('what a duplicate email looks like coming back from the database', () => {
  it('recognises the unique violation Postgres raises', () => {
    expect(duplicateEmail({ code: '23505', constraint: 'user_email_unique' })).toBe(true)
  })

  /**
   * **Better Auth wraps it**, so the code is not always at the top level: the
   * adapter throws its own error with the driver's underneath.
   */
  it('finds it underneath a wrapper', () => {
    expect(duplicateEmail(new Error('failed to create user', { cause: { code: '23505' } }))).toBe(
      true,
    )
  })

  it('recognises the library saying it in words', () => {
    expect(duplicateEmail({ message: 'User already exists' })).toBe(true)
  })

  /**
   * **Anything else is not a duplicate**, and this is the assertion that keeps
   * the clause honest: a matcher that shrugged and said true would turn every
   * failure - a database that is away, a password rule the plugin refused - into
   * "that account already exists", which is a wrong answer rather than a
   * missing one.
   */
  it('does not claim an unrelated failure is a duplicate', () => {
    expect(duplicateEmail(new Error('connection terminated unexpectedly'))).toBe(false)
    expect(duplicateEmail({ code: '23503' })).toBe(false)
    expect(duplicateEmail(undefined)).toBe(false)
  })
})

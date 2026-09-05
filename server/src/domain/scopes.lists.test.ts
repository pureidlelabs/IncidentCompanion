import { describe, expect, it } from 'vitest'

import { isScope, SCOPES } from './scopes.lists'

describe('isScope', () => {
  it('accepts every scope the list holds', () => {
    for (const scope of SCOPES) expect(isScope(scope)).toBe(true)
  })

  /**
   * **The near-misses are the whole reason this is a check and not a cast.**
   * `'case'` for `'cases'` announced against a key no query read, and it read
   * as working for two review rounds. A test naming only `'nonsense'` would
   * pass against a check that answered `true` for anything case-shaped.
   */
  it.each(['case', 'compliance', 'case_Compliance', 'Timeline', '', 'timeline '])(
    'rejects %o, which is not a scope', (value) => {
      expect(isScope(value)).toBe(false)
    },
  )
})

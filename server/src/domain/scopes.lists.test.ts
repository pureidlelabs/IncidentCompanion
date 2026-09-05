import { describe, expect, it } from 'vitest'

import { isScope, SCOPES } from './scopes.lists'

describe('isScope', () => {
  it('accepts every scope the list holds', () => {
    for (const scope of SCOPES) expect(isScope(scope)).toBe(true)
  })

  /**
   * **The near-misses are the whole reason this is a check and not a cast.**
   */
  it.each(['case', 'compliance', 'case_Compliance', 'Timeline', '', 'timeline '])(
    'rejects %o, which is not a scope', (value) => {
      expect(isScope(value)).toBe(false)
    },
  )
})

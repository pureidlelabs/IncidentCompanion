import { describe, expect, it } from 'vitest'

import { matchesWords } from './word-match'

describe('a word match', () => {
  it('matches every row on a blank query', () => {
    expect(matchesWords('Meridian ransomware', '')).toBe(true)
    expect(matchesWords('Meridian ransomware', '   ')).toBe(true)
  })

  it('takes the words in either order', () => {
    expect(matchesWords('Meridian ransomware', 'ran mer')).toBe(true)
    expect(matchesWords('Meridian ransomware', 'mer ran')).toBe(true)
  })
})

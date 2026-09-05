import { describe, expect, it } from 'vitest'

import { paletteFuzzyMatches, paletteRank } from './palette-results'

/**
 * **The palette matches a subsequence, and orders by how well it matched.**
 *
 * The two are separate on purpose: matching decides what an analyst can reach
 * by typing an acronym, and ranking decides what their first Enter lands on.
 * A matcher that also ordered would put the acronym above the exact word.
 *
 * Written from the attack: a subsequence matcher's failure is matching too
 * much, so the assertions that matter are the negative ones.
 */

describe('the palette matches a subsequence', () => {
  it.each([
    ['csett', 'Case settings'],
    ['tl', 'Timeline'],
    ['cs', 'Case settings'],
  ])('finds %s in %s, which is what typing an acronym is', (query, text) => {
    expect(paletteFuzzyMatches(query, text)).toBe(true)
  })

  it('reads the characters in order, so a reversed acronym misses', () => {
    expect(paletteFuzzyMatches('es', 'Save')).toBe(false)
    expect(paletteFuzzyMatches('se', 'Save')).toBe(true)
  })

  it('refuses a character the text does not hold at all', () => {
    expect(paletteFuzzyMatches('zzz', 'Save')).toBe(false)
    expect(paletteFuzzyMatches('savez', 'Save')).toBe(false)
  })

  it('ignores the spaces in what was typed, not in what is matched', () => {
    expect(paletteFuzzyMatches('c sett', 'Case settings')).toBe(true)
    expect(paletteFuzzyMatches('case settings', 'Casesettings')).toBe(true)
  })

  it('is blind to case in both directions', () => {
    expect(paletteFuzzyMatches('SAVE', 'save')).toBe(true)
    expect(paletteFuzzyMatches('save', 'SAVE')).toBe(true)
  })

  it('matches everything against an empty query, which is what an open palette shows', () => {
    expect(paletteFuzzyMatches('', 'Anything at all')).toBe(true)
  })
})

describe('the palette ranks what it matched', () => {
  it('puts a prefix above a word found later', () => {
    expect(paletteRank('sa', 'Save')).toBeLessThan(paletteRank('ave', 'Save'))
  })

  it('puts anything it contains above something it only matched by subsequence', () => {
    expect(paletteRank('ave', 'Save')).toBeLessThan(paletteRank('sve', 'Save'))
  })

  it('does not read the query as a subsequence, which the matcher does', () => {
    // `sve` is a subsequence of `Save` and not a substring, so it ranks last
    // while still matching -- the split the two functions exist for.
    expect(paletteFuzzyMatches('sve', 'Save')).toBe(true)
    expect(paletteRank('sve', 'Save')).toBe(2)
  })

  it('trims what was typed before ranking, so a trailing space is not a miss', () => {
    expect(paletteRank('sa ', 'Save')).toBe(0)
  })
})

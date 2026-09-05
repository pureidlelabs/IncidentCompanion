import { describe, expect, it } from 'vitest'

import { ACTION_TYPE_COLOUR, ENTRY_COLOUR, SEVERITY_COLOUR } from './colours.lists.js'
import { ACTIVITY_ACTION, SEVERITY } from './vocabularies.lists.js'

/**
 * The palette's shape, which one client reads as a contract and none of it is
 * declared in a type.
 */

describe('the served palette', () => {
  /**
   * **Three equal families, or the band folds the wrong swatches.**
   */
  it('is three equal runs, so a third of it is the bases', () => {
    expect(ENTRY_COLOUR.length % 3, 'the palette is not three equal runs').toBe(0)
    const third = ENTRY_COLOUR.length / 3
    expect(Math.ceil(ENTRY_COLOUR.length / 3), 'baseCount would not be the bases').toBe(third)
  })

  it('offers every colour once', () => {
    expect(new Set(ENTRY_COLOUR).size).toBe(ENTRY_COLOUR.length)
  })

  it('is hexes, because a stored value has to render where no theme exists', () => {
    for (const hex of ENTRY_COLOUR) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('what a driving value resolves to', () => {
  /**
   * **Every value the vocabulary offers has a colour, and every colour is one
   * the picker offers.**
   */
  it.each([
    ['severity', SEVERITY, SEVERITY_COLOUR],
    ['activity action', ACTIVITY_ACTION, ACTION_TYPE_COLOUR],
  ])('maps every %s value into the palette', (_name, vocabulary, colours) => {
    const offered = new Set<string>(ENTRY_COLOUR)
    for (const value of vocabulary) {
      const hex = colours[value]
      expect(hex, `${value} maps to no colour`).toBeTruthy()
      expect(offered.has(hex!), `${value} maps to ${String(hex)}, not in the palette`).toBe(true)
    }
  })

  /** And nothing is mapped that the vocabulary does not offer. */
  it.each([
    ['severity', SEVERITY, SEVERITY_COLOUR],
    ['activity action', ACTIVITY_ACTION, ACTION_TYPE_COLOUR],
  ])('maps no %s value the vocabulary dropped', (_name, vocabulary, colours) => {
    const known = new Set<string>(vocabulary)
    expect(Object.keys(colours).filter((one) => !known.has(one))).toEqual([])
  })
})

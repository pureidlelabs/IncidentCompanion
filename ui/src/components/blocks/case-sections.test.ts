import { describe, expect, it } from 'vitest'


import {
  ENTRY_SLUG,
  SECTIONS,
  SECTION_ALIASES,
  canonicalSlug,
  groupHolding,
} from './case-sections'

/**
 * What a slug means, with no screen anywhere near it.
 */
describe('the slug a section is addressed by', () => {
  it('answers a slug the product has with itself', () => {
    expect(canonicalSlug('timeline')).toBe('timeline')
    // A section with a screen of its own. `cloud-apps` stood here until the
    // kinds became fragments of the entities page, and asserting that it
    // resolved to itself was asserting the state that draws the refusal.
    expect(canonicalSlug('evidence')).toBe('evidence')
  })

  /**
   * Two rail rows, one screen.
   */
  it('follows an alias to the section it addresses', () => {
    expect(canonicalSlug('settings')).toBe('overview')
  })

  /**
   * **The one answer a fallback would destroy.**
   */
  it('answers nothing for a slug no section has', () => {
    expect(canonicalSlug('kill-chain')).toBeUndefined()
    expect(canonicalSlug('')).toBeUndefined()
    expect(canonicalSlug(undefined)).toBeUndefined()
  })

  /**
   * `SECTION_ALIASES` is a plain object, so a query for `toString` or
   * `constructor` reaches `Object.prototype` and comes back with a function.
   */
  it('answers nothing for a name every object carries', () => {
    expect(canonicalSlug('constructor')).toBeUndefined()
    expect(canonicalSlug('toString')).toBeUndefined()
    expect(canonicalSlug('__proto__')).toBeUndefined()
  })

  /** Every alias has somewhere to land, or it is a dead URL nobody notices. */
  it('resolves every alias onto a section that exists', () => {
    const dangling = Object.entries(SECTION_ALIASES)
      .filter(([, target]) => !Object.hasOwn(SECTIONS, target))
      .map(([alias]) => alias)
    expect(dangling).toEqual([])
  })

  /** And no alias shadows a real slug, which would make it unreachable. */
  it('aliases nothing that is already a section', () => {
    const shadowing = Object.keys(SECTION_ALIASES).filter((alias) =>
      Object.hasOwn(SECTIONS, alias),
    )
    expect(shadowing).toEqual([])
  })
})

describe('the section a case opens on', () => {
  /**
   * It is a section, not a heading with a fold.
   */
  it('is a section the outlet can draw', () => {
    expect(canonicalSlug(ENTRY_SLUG)).toBe(ENTRY_SLUG)
  })
})

describe('the group a slug sits in', () => {
  /**
   * The group holding a row is what keeps it open while the analyst stands in
   * it.
   */
  it('finds the group holding a row, and none for a slug no row has', () => {
    expect(groupHolding('assets')?.label).toBe('Collect')
    expect(groupHolding('entities')?.label).toBe('Collect')
    expect(groupHolding('overview')?.label).toBeNull()
    expect(groupHolding('nothing-here')).toBeUndefined()
  })
})

/**
 * A kind is a fragment of the entities page and has no screen of its own, so
 * its bare slug is still an address somebody has bookmarked or typed.
 */
describe('a kind resolves to the page it is a fragment of', () => {
  it.each(['assets', 'accounts', 'network', 'malware', 'cloud-apps'])(
    'lands %s on entities rather than on a refusal',
    (kind) => {
      expect(canonicalSlug(kind)).toBe('entities')
    },
  )

  it('leaves a real section resolving to itself', () => {
    expect(canonicalSlug('entities')).toBe('entities')
    expect(canonicalSlug('timeline')).toBe('timeline')
  })

  it('still answers undefined for a slug that is neither', () => {
    expect(canonicalSlug('not-a-section')).toBeUndefined()
  })
})

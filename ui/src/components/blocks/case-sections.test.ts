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
 *
 * **Identity is what lets the outlet stay off the element map.** Resolve
 * `:section` through a registry that builds every section's JSX at module
 * scope and asking what a slug is called pulls in the whole app. These read
 * the half that answers without rendering anything.
 *
 * Written from the attacks a resolver is available to: pardoning a slug the
 * product does not have, dropping an alias so a bookmark lands on an empty
 * state, and letting the landing page drift from the row the rail draws first.
 */
describe('the slug a section is addressed by', () => {
  it('answers a slug the product has with itself', () => {
    expect(canonicalSlug('timeline')).toBe('timeline')
    // A section with a screen of its own, which is what this case needs: a
    // fragment here resolves to its parent, so asserting that it answers with
    // itself would be asserting the state that draws the refusal.
    expect(canonicalSlug('evidence')).toBe('evidence')
  })

  /**
   * An address the rail no longer offers still lands on the section that
   * absorbed it, so a link written down before the fold goes on working rather
   * than reaching the named refusal.
   */
  it('follows an alias to the section it addresses', () => {
    expect(canonicalSlug('settings')).toBe('overview')
  })

  /**
   * **The one answer a fallback would destroy.** A typed slug landing on the
   * overview looks exactly like a link that worked, and the analyst has no way
   * to tell. `undefined` is what the outlet turns into a named refusal.
   */
  it('answers nothing for a slug no section has', () => {
    expect(canonicalSlug('kill-chain')).toBeUndefined()
    expect(canonicalSlug('')).toBeUndefined()
    expect(canonicalSlug(undefined)).toBeUndefined()
  })

  /**
   * `SECTION_ALIASES` is a plain object, so a query for `toString` or
   * `constructor` reaches `Object.prototype` and comes back with a function.
   * A resolver answering `'kill-chain'` and `'constructor'` differently is one
   * a URL can walk out of.
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
   *
   * **That it is also the rail's first row is guaranteed by construction, and
   * needs no case here.** `ENTRY_SLUG` is `firstRailSlug()`, which reads
   * `RAIL_GROUPS[0].rows[0].slug` and throws on an empty rail, and every
   * consumer -- the index redirect in `routes.tsx` among them -- uses the
   * constant rather than a literal. A case asserting `ENTRY_SLUG` equals that
   * same expression stood here and could not fail. Being *drawable* is the
   * half that is not structural, which is what this asserts.
   */
  it('is a section the outlet can draw', () => {
    expect(canonicalSlug(ENTRY_SLUG)).toBe(ENTRY_SLUG)
  })
})

describe('the group a slug sits in', () => {
  /**
   * The group holding a row is what keeps it open while the analyst stands in
   * it. `assets` is the entities page's door rather than a section of its own,
   * and it is a row like any other as far as the group is concerned.
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
 *
 * **The attack is the refusal, not the redirect.** `assets` sits in `SECTIONS`
 * for its title and icon, so a resolver checking membership first hands it
 * back unchanged, no element answers it, and the outlet draws *This case has
 * no section called "assets"* -- indistinguishable from a link that never
 * worked.
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

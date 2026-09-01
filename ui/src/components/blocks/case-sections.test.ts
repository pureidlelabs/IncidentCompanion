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
 * **Identity is what lets the outlet stay off the element map.** Resolving
 * `:section` used to mean importing a registry that builds every section's JSX
 * at module scope, so asking what a slug is called pulled in the whole app.
 * These read the half that answers without rendering anything.
 *
 * Written from the attacks a resolver is available to: pardoning a slug the
 * product does not have, dropping an alias so a bookmark lands on an empty
 * state, and letting the landing page drift from the row the rail draws first.
 */
describe('the slug a section is addressed by', () => {
  it('answers a slug the product has with itself', () => {
    expect(canonicalSlug('timeline')).toBe('timeline')
    expect(canonicalSlug('cloud-apps')).toBe('cloud-apps')
  })

  /**
   * The URL keeps working and the section it named is what renders. A redirect
   * was the rejected alternative: it rewrites what the analyst bookmarked.
   */
  it('follows an alias to the section it addresses', () => {
    expect(canonicalSlug('network_indicators')).toBe('network')
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
   * **That it is the rail's first row is guaranteed by construction, not by a
   * case here.** `ENTRY_SLUG` is `firstRailSlug()`, which reads
   * `RAIL_GROUPS[0].rows[0].slug` and throws on an empty rail, and every
   * consumer -- the index redirect in `routes.tsx` among them -- uses the
   * constant rather than a literal. A case asserting `ENTRY_SLUG` equals that
   * same expression stood here and could not fail.
   *
   * What is not structural is below: the first row being a *drawable* section
   * rather than a heading that folds.
   */

  /** It is a section, not a heading with a fold. */
  it('is a section the outlet can draw', () => {
    expect(canonicalSlug(ENTRY_SLUG)).toBe(ENTRY_SLUG)
  })
})

describe('the group a slug sits in', () => {
  /** A child section holds its parent's group open, or the rail shuts on it. */
  it('finds the group holding a section reached through a fold', () => {
    expect(groupHolding('accounts')?.label).toBe('Collect')
    expect(groupHolding('overview')?.label).toBeNull()
    expect(groupHolding('nothing-here')).toBeUndefined()
  })
})

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { ENTITY_KINDS } from '@/components/blocks/entity-scope'
import { SECTIONS } from '@/components/blocks/case-sections'
import { specsFixture } from '@/fixtures/specs'

import { ENTITY_TARGETS, formForCollection, referenceFieldsOf, sectionPathFor } from './entityTargets'

/**
 * The two agreements `ENTITY_TARGETS` is a hand-written mirror of.
 *
 * Both are unobservable from the screen: a wrong `collection` fetches a table
 * that exists, finds no row, and renders the card's missing state - which is
 * also what a genuinely deleted row looks like. A wrong `slug` navigates to
 * the picker's `*` redirect. Neither throws, and neither is visible in a
 * green suite without these.
 */

describe('every ref target the API publishes', () => {
  it('is in the map, pointing at the collection the spec gives it', () => {
    for (const field of referenceFieldsOf(specsFixture)) {
      const ref = field.ref
      expect(ref).toBeDefined()
      const target = ENTITY_TARGETS[ref?.target ?? '']
      expect(target, `no ENTITY_TARGETS entry for ${ref?.target ?? '?'}`).toBeDefined()
      expect(target?.collection).toBe(ref?.collection)
    }
  })

  it('names a section that exists, by the title that section carries', () => {
    for (const [name, target] of Object.entries(ENTITY_TARGETS)) {
      // The registry is keyed by slug, so `Object.hasOwn` rather than a
      // membership test: `constructor` is on every object's prototype and
      // would read as a section that exists.
      const section = Object.hasOwn(SECTIONS, target.slug) ? SECTIONS[target.slug] : undefined
      expect(section, `${name} points at slug ${target.slug}, which is not a section`).toBeDefined()
      expect(target.title).toBe(section?.title)
    }
  })

  it('resolves a form for each target collection', () => {
    for (const target of Object.values(ENTITY_TARGETS)) {
      expect(formForCollection(specsFixture, target.collection)?.collection).toBe(target.collection)
    }
  })
})

describe('the path a link points at', () => {
  it('is the section under the open case, with the id escaped', () => {
    expect(sectionPathFor('A/B', 'system')).toBe('/cases/A%2FB/entities#assets')
  })

  it('is nothing for a target no section renders', () => {
    expect(sectionPathFor('DEMO', 'report_block')).toBeUndefined()
  })

  it('carries an entity id as ?highlight=, escaped', () => {
    expect(sectionPathFor('DEMO', 'system', 'sys 1/2')).toBe(
      '/cases/DEMO/entities?highlight=sys%201%2F2#assets',
    )
  })

  it('omits the query entirely when no id is given', () => {
    expect(sectionPathFor('DEMO', 'system')).toBe('/cases/DEMO/entities#assets')
  })
})

describe("the entity sections' scope dispatch", () => {
  /**
   * **A slug with no arm renders nothing - no table, no empty state, no
   * error.** Renaming `systems` to `assets` without its `case` left the Assets
   * page blank and 1326 unit tests green; nothing in that tier asks whether a
   * screen drew anything, and a `switch` falling through to `default` is not a
   * throw.
   *
   * Read from source rather than by mounting: the failure is that a branch does
   * not exist, and a test that mounts one scope at a time only covers the
   * spellings someone remembered to enumerate.
   */
  it('has an arm for every entity slug the rail offers', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(
      join(here, '..', 'components', 'blocks', 'entity-scope-table.tsx'),
      'utf8',
    )
    const arms = new Set(
      [...source.matchAll(/case\s+['"]([a-z-]+)['"]:/g)].flatMap((m) => (m[1] ? [m[1]] : [])),
    )
    expect(arms.size, 'no case arms found -- the dispatch moved or changed shape').toBeGreaterThan(0)

    // `ENTITY_KINDS`, not `ENTITY_TARGETS`: the latter also names Evidence,
    // which is its own section and reaches no `switch` here.
    const entitySlugs = ENTITY_KINDS.map((kind) => kind.slug)
    expect(entitySlugs.length).toBeGreaterThan(0)
    for (const slug of entitySlugs) {
      expect(arms, `no "case ${slug}" in the scope table -- that page renders nothing`).toContain(
        slug,
      )
    }
  })

  /**
   * **Three things have to agree, and guarding two of them guards nothing.**
   * A target names the scope its link addresses, the scope table switches on
   * it, `ENTITY_KINDS` names it. Renaming only one left every other check
   * satisfied and the page rendering - with the generic "Add entry" where "Add
   * asset" belongs and the attention count at 0 instead of 15, which reads as a
   * case with nothing in it rather than as a fault.
   *
   * **The scope was a prop in `section-elements.tsx` and is now the fragment a
   * target addresses**, so it is read from `ENTITY_TARGETS` rather than out of
   * that file's source. The five kinds have no routes of their own any more:
   * one page, and the fragment says which kind is on screen.
   *
   * A target with no `scope` is a section of its own - Evidence, Methods - and
   * is not in this question.
   */
  it('points every entity kind at a scope some target addresses', () => {
    const addressed = Object.values(ENTITY_TARGETS).flatMap((one) =>
      one.scope === undefined ? [] : [one.scope],
    )

    expect(
      addressed.length,
      'no target carries a scope -- the addressing moved or changed shape',
    ).toBeGreaterThan(0)

    for (const scope of addressed) {
      expect(
        ENTITY_KINDS.map((kind) => kind.slug),
        `a target addresses #${scope}, which is not an entity kind`,
      ).toContain(scope)
    }
    for (const kind of ENTITY_KINDS) {
      expect(
        addressed,
        `no target addresses #${kind.slug} -- nothing can link to that view`,
      ).toContain(kind.slug)
    }
  })
})

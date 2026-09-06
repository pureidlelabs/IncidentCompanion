import { describe, expect, it } from 'vitest'

import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

import { searchCase } from './case-search'

/**
 * The matcher two screens share, attacked rather than demonstrated.
 *
 * Every case below is a way to make it answer something it must not: match on
 * nothing, match on an id, widen where it should narrow, or claim a field
 * matched that did not.
 */

const BLANK: Case = {
  ...campaignCase,
  timeline: [],
  systems: [],
  accounts: [],
  networkIndicators: [],
  malware: [],
  cloudApps: [],
  impact: [],
  evidence: [],
  actions: [],
  casenotes: [],
}

function count(groups: ReturnType<typeof searchCase>): number {
  return groups.reduce((total, group) => total + group.hits.length, 0)
}

describe('a case-wide search', () => {
  /**
   * The one that decides whether the palette can tell "just opened" from "the
   * query matched everything". Both an empty string and whitespace have to
   * answer nothing, because a trimmed empty query is what a cleared box sends.
   */
  it.each(['', ' ', '\t\n', '   '])('answers nothing for %j', (query) => {
    expect(searchCase(campaignCase, query)).toEqual([])
  })

  /**
   * A uuid is in every row and nobody types one. Matching on it would make the
   * first eight characters of any id a query that returns the whole case.
   */
  it('never matches a row on its own id', () => {
    const [first] = campaignCase.systems
    expect(first).toBeDefined()
    expect(count(searchCase(campaignCase, first?.id ?? 'no-id'))).toBe(0)
  })

  /**
   * *A search MUST NOT reach outside the case it is made in.*
   *
   * > #### Scenario: The value appears in another case
   * > - GIVEN a value appearing in a different case
   * > - WHEN an analyst searches this case for it
   * > - THEN the other case's rows are not shown
   *
   * **The value is asserted findable first**, in the case that holds it. A
   * search answering nothing for every query would satisfy the second half
   * perfectly and be the worst possible answer to the first.
   *
   * **What this does not cover:** whether a case document can arrive carrying
   * another case's rows. That is the store's boundary rather than the
   * matcher's, and it is answered where the rows are read.
   */
  it("does not show another case's rows", () => {
    const MINE = 'a-value-only-the-other-case-holds'
    const [borrowed] = campaignCase.systems
    expect(borrowed, 'the fixture names no asset to move').toBeDefined()

    const theirs: Case = { ...BLANK, systems: [{ ...borrowed!, hostname: MINE }] }
    const mine: Case = { ...BLANK }

    expect(
      count(searchCase(theirs, MINE)),
      'the value cannot be found in the case that holds it, so finding nothing in the other ' +
        'case says nothing',
    ).toBeGreaterThan(0)
    expect(searchCase(mine, MINE), "a search of one case answered with another case's row").toEqual(
      [],
    )
  })

  it('narrows on a second term rather than widening', () => {
    const one = count(searchCase(campaignCase, 'backup'))
    const two = count(searchCase(campaignCase, 'backup encrypt'))
    const impossible = count(searchCase(campaignCase, 'backup zzzznothing'))
    expect(one).toBeGreaterThan(0)
    expect(two).toBeLessThan(one)
    expect(impossible).toBe(0)
  })

  it('matches whatever case the value is stored in', () => {
    expect(count(searchCase(campaignCase, 'dc-01'))).toBe(count(searchCase(campaignCase, 'DC-01')))
    expect(count(searchCase(campaignCase, 'dc-01'))).toBeGreaterThan(0)
  })

  /**
   * A section reports its own label rather than the wire's key. `systems` is
   * the collection and Assets is what the analyst calls it, and a hit labelled
   * `systems` sends them to a rail row that does not exist.
   */
  it('labels a group with the analyst word, not the wire key', () => {
    const labels = searchCase(campaignCase, 'dc-01').map((group) => group.label)
    expect(labels).toContain('Assets')
    expect(labels).not.toContain('systems')
  })

  /**
   * A caller opening a group's own section needs its case field key, not the
   * label drawn beside it - a label survives a copy edit no differently, and a
   * caller matching on it breaks the day the heading's wording changes.
   */
  it('carries the case field key alongside the label', () => {
    const assets = searchCase(campaignCase, 'dc-01').find((group) => group.label === 'Assets')
    expect(assets?.key).toBe('systems')
  })

  /**
   * Every field a hit names has to contain a term. The summary is the whole
   * reason a hit is readable without opening the row, so a field listed there
   * that did not match is a lie about why the row is on screen.
   */
  it('names only fields that actually matched', () => {
    for (const group of searchCase(campaignCase, 'ransom')) {
      for (const hit of group.hits) {
        for (const field of hit.matched) {
          expect(field.value.toLowerCase()).toContain('ransom')
        }
      }
    }
  })

  /**
   * The claim the screen's own blurb makes, and the reason it exists beside
   * the per-table filters: a hostname finds the rows *pointing at* that asset
   * and not only the asset row.
   *
   * Asserted on the *field that matched* rather than on the hit count: the
   * demo also names `BKP-01` in a description, so a count would pass whether
   * or not a single reference was ever resolved.
   */
  it('finds the rows pointing at an asset, not only the asset row', () => {
    const groups = searchCase(campaignCase, 'bkp-01')
    const timeline = groups.find((group) => group.label === 'Timeline')
    expect(groups.map((group) => group.label)).toContain('Assets')
    const viaReference = (timeline?.hits ?? []).flatMap((hit) =>
      hit.matched.filter((field) => /Ids?$/.test(field.field)),
    )
    expect(viaReference.length).toBeGreaterThan(0)
  })

  it('does not match a reference on the id it stores', () => {
    const [asset] = campaignCase.systems
    expect(asset).toBeDefined()
    const pointing = campaignCase.timeline.filter(
      (entry) => (entry as { systemId?: string | null }).systemId === asset?.id,
    )
    expect(pointing.length).toBeGreaterThan(0)
    expect(count(searchCase(campaignCase, asset?.id ?? 'no-id'))).toBe(0)
  })

  it('reports no group for a collection nothing matched', () => {
    for (const group of searchCase(campaignCase, 'dc-01')) {
      expect(group.hits.length).toBeGreaterThan(0)
    }
  })

  it('answers nothing for a case with no rows', () => {
    expect(searchCase(BLANK, 'anything')).toEqual([])
  })

  /**
   * A hit is identified by its row, so two screens rendering the same hit key
   * it the same way. The demo's rows all carry a uuid.
   */
  it('keys a hit by the row it came from', () => {
    const ids = searchCase(campaignCase, 'dc-01').flatMap((group) =>
      group.hits.map((hit) => hit.id),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })
})

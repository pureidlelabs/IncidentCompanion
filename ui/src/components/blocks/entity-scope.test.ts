import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import {
  ENTITY_KINDS,
  NO_FILTER,
  applyEntityFilter,
  attentionCounts,
  entityRows,
  matchesEntity,
  searchEntities,
  type EntityRowView,
} from './entity-scope'

/**
 * The entity family's projection and its narrowing, over the campaign demo.
 *
 * **Written because the story tier cannot see any of this.** The stories
 * rendering these screens are smoke tests: mutating `matchesEntity` to
 * `return true` - the search switched off entirely - leaves both tiers green,
 * the "Filtered to nothing" story included, because a story asserts that a
 * screen rendered rather than what it rendered.
 */

const rows = entityRows(campaignCase, specsFixture.fieldTones)

/** A row of each kind, by slug, for the assertions that need one. */
function firstOf(slug: EntityRowView['slug']): EntityRowView {
  const row = rows.find((one) => one.slug === slug)
  if (!row) throw new Error(`the campaign demo holds no ${slug}`)
  return row
}

describe('the projection', () => {
  it('holds every entity in the case, over five kinds', () => {
    expect(rows).toHaveLength(
      campaignCase.systems.length +
        campaignCase.accounts.length +
        campaignCase.networkIndicators.length +
        campaignCase.malware.length +
        campaignCase.cloudApps.length,
    )
    expect([...new Set(rows.map((row) => row.slug))].sort()).toEqual(
      ENTITY_KINDS.map((kind) => kind.slug).sort(),
    )
  })

  it('resolves a reference to its name rather than its id', () => {
    const malware = firstOf('malware')
    // The linked system is a hostname an analyst would type, never a uuid.
    expect(malware.linked).not.toMatch(/^[0-9a-f-]{36}$/)
    expect(campaignCase.systems.map((system) => system.hostname)).toContain(malware.linked)
  })
})

describe('the search', () => {
  it('matches over displayed values and refuses what is nowhere', () => {
    const hostname = firstOf('assets').identity
    expect(matchesEntity(firstOf('assets'), hostname)).toBe(true)
    expect(matchesEntity(firstOf('assets'), 'no entity says this')).toBe(false)
  })

  /**
   * **Re-anchored when the box was narrowed to the Identity column.** The
   * property held is unchanged - a second word narrows - but `standard` lives
   * in an account's privileges, which is the Detail column, so the old pair
   * asked the question of a field this box no longer reads and would have gone
   * green at zero rows either way. `staff` is in the identity itself.
   */
  it('is AND across terms, so a second word narrows rather than widens', () => {
    const one = searchEntities(rows, { ...NO_FILTER, q: 'meridian' })
    const two = searchEntities(rows, { ...NO_FILTER, q: 'meridian staff' })
    expect(one.length).toBeGreaterThan(0)
    expect(two.length).toBeGreaterThan(0)
    expect(two.length).toBeLessThan(one.length)
  })

  it('leaves every row when the query is blank', () => {
    expect(searchEntities(rows, NO_FILTER)).toHaveLength(rows.length)
  })

  /**
   * The claim the scope row is built on: one string reaches more than one kind,
   * so the counts beside the scopes answer "which kind is my string in".
   */
  it('spans more than one kind at once', () => {
    const hits = searchEntities(rows, { ...NO_FILTER, q: 'meridian' })
    expect(new Set(hits.map((row) => row.slug)).size).toBeGreaterThan(1)
  })

  it('matches an id-only string against nothing, since ids are not displayed', () => {
    expect(searchEntities(rows, { ...NO_FILTER, q: firstOf('malware').id })).toHaveLength(0)
  })

  /**
   * **The badge names one column, and the box searches that column.**
   *
   * The screen's badge reads `Entity`; the column carrying the row's own name
   * is `Identity` unscoped, and the kind's own identifying column when scoped.
   * That is the one this box reads, so the kind, the state, the reference and
   * the detail beside it are not searched - which is what the badge promised
   * and the six-field haystack did not do.
   *
   * A row built here rather than taken from the demo: the assertion is that a
   * term in another column is *not* found, and a demo row's fields overlap
   * often enough that a coincidence would answer for the code.
   */
  describe('reads the Identity column and no other', () => {
    const row: EntityRowView = {
      id: 'm1',
      kind: 'Malware',
      slug: 'malware',
      collection: 'malware',
      version: 1,
      identity: 'locker.exe',
      state: 'confirmed',
      stateField: 'verdict',
      linked: 'WKS-FIN01',
      detailParts: [{ value: 'p.zero@meridian.example' }, { value: 'abc123def' }],
      detail: 'p.zero@meridian.example \u00b7 abc123def',
      source: 'Defender',
      attention: true,
      fields: {},
    }

    it('matches a word in the identity', () => {
      expect(matchesEntity(row, 'locker')).toBe(true)
    })

    it.each([
      ['Kind', 'malware'],
      ['State', 'confirmed'],
      ['Linked', 'wks-fin01'],
      ['Detail', 'abc123def'],
      ['Source', 'defender'],
    ])('refuses a value that is only in %s', (_column, term) => {
      expect(matchesEntity(row, term)).toBe(false)
    })
  })
})

describe('the chips', () => {
  it('narrows to the chosen kinds', () => {
    const only = applyEntityFilter(rows, { ...NO_FILTER, kinds: ['Malware'] })
    expect(only).toHaveLength(campaignCase.malware.length)
    expect(only.every((row) => row.slug === 'malware')).toBe(true)
  })

  it('narrows to what the server calls a concern, and to what it does not', () => {
    const worrying = applyEntityFilter(rows, { ...NO_FILTER, attention: 'attention' })
    expect(worrying.length).toBeGreaterThan(0)
    expect(worrying.every((row) => row.attention === true)).toBe(true)
    const calm = applyEntityFilter(rows, { ...NO_FILTER, attention: 'clear' })
    expect(calm.every((row) => row.attention === false)).toBe(true)
  })

  it('applies the search and the chips together', () => {
    const both = applyEntityFilter(rows, { ...NO_FILTER, q: 'meridian', kinds: ['Accounts'] })
    expect(both.length).toBeGreaterThan(0)
    expect(both.every((row) => row.slug === 'accounts')).toBe(true)
    expect(both.length).toBeLessThan(
      searchEntities(rows, { ...NO_FILTER, q: 'meridian' }).length,
    )
  })
})

/**
 * **The served tone map is the only opinion, and it does not cover every kind.**
 *
 * Accounts declare `stateField: 'disabled'` and Cloud Apps `verifiedPublisher`,
 * and `GET /api/specs` publishes a tone for neither. So the state of every
 * account and every cloud app is a word the server has no opinion about, and a
 * count that puts them on either side of the attention line is inventing one.
 *
 * **The split is the served fill bit**, which is the axis introduced to answer
 * exactly *is anything wrong here*. Reading `tone === 'bad'` instead calls an
 * `accessed` host Clear -- a false all-clear on a host somebody got into.
 *
 * **Measured over the campaign demo: 78 rows are 58 adverse and 20 the served
 * document maps nothing for, and not one is clear.** 15 `accessed` and 1
 * `suspicious` are what the old reading counted as Clear. The demo holds no
 * `clean` asset, no `benign` indicator and no `untouched` impact, so the Clear
 * chip reads 0 on it and a chip at 0 disables itself -- **a gap in the demo
 * content, not in the split.** A fresh case leaves every asset on `unknown`,
 * which is unmapped and in neither chip; Clear fills as an analyst clears
 * hosts. Asserting a non-zero Clear here would pin the design to what this
 * demo happens to hold.
 */
describe('the attention counts', () => {
  /** A row the served document maps no tone field for at all. */
  const unmapped = (row: EntityRowView) =>
    specsFixture.fieldTones[row.stateField] === undefined

  const toneOfRow = (row: EntityRowView) =>
    specsFixture.fieldTones[row.stateField]?.[row.state.trim().toLowerCase()]

  it('holds which kinds the server maps no tone for', () => {
    // Pinned rather than required: an unmapped state field is handled, not
    // forbidden, and this is what says so when the server starts mapping one.
    const slugs = [...new Set(rows.filter(unmapped).map((row) => row.slug))].sort()
    expect(slugs).toEqual(['accounts', 'cloud-apps'])
  })

  it('counts neither side for a row the server has no opinion on', () => {
    const counts = attentionCounts(rows)
    const blind = rows.filter(unmapped).length
    expect(blind).toBeGreaterThan(0)
    // The two chips together must not claim rows nothing classified.
    expect(counts.attention + counts.clear).toBe(rows.length - blind)
  })

  /**
   * **Anchored on the fill bit**, not on `tone === 'bad'`, which is an abstract
   * tone word the server does not serve. Fill *is* the served answer to "is
   * anything wrong here", so attention asks the axis introduced to carry
   * exactly that question rather than inferring it from a hue.
   */
  it('calls a row attention only where the server says something is wrong', () => {
    const counts = attentionCounts(rows)
    expect(counts.attention).toBe(
      rows.filter((row) => toneOfRow(row)?.fill === 'solid').length,
    )
    expect(counts.attention).toBeGreaterThan(0)
  })

  it('calls a row clear only where the server mapped it and found nothing wrong', () => {
    const counts = attentionCounts(rows)
    const calm = rows.filter((row) => !unmapped(row) && toneOfRow(row)?.fill !== 'solid')
    expect(counts.clear).toBe(calm.length)
    // Every one of them is a kind the server publishes a tone field for.
    expect(calm.every((row) => !unmapped(row))).toBe(true)
  })

  /**
   * **The demo's own shape, pinned so it cannot drift unnoticed.** It is not a
   * property of the split -- it is what makes the Clear chip read 0 on this
   * case, and the thing to change is the demo. Going red here means somebody
   * gave the campaign a clean host, which is the fix.
   */
  it('holds no clear row at all, which is the campaign demo and not the rule', () => {
    expect(attentionCounts(rows).clear).toBe(0)
    expect(attentionCounts(rows).attention).toBe(58)
  })

  it('leaves an account and a cloud app out of both chips', () => {
    const blind = rows.filter(unmapped)
    expect(blind.some((row) => row.slug === 'accounts')).toBe(true)
    expect(blind.some((row) => row.slug === 'cloud-apps')).toBe(true)
    expect(
      applyEntityFilter(rows, { ...NO_FILTER, attention: 'attention' })
        .concat(applyEntityFilter(rows, { ...NO_FILTER, attention: 'clear' }))
        .some((row) => unmapped(row)),
    ).toBe(false)
  })
})

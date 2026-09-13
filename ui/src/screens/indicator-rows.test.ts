import { describe, expect, it } from 'vitest'

import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

import {
  actionableCount,
  collectIndicators,
  pushable,
  matchesIndicator,
  indicatorsStix,
  nothingToPush,
  type Indicator,
} from './indicator-rows'

/**
 * What the case would hand to a blocklist or a TIP.
 *
 * **Two of the three claims this file holds were false when it was written.**
 * A blank disposition counted as actionable, which made the two numbers the
 * badge exists to contrast identical and stopped the empty-bundle warning ever
 * firing; and every malware digest in the demo was 65 characters, so
 * `hashTypeOf` returned null for all twelve and the screen silently carried no
 * hashes at all while its own docstring said it did.
 */

const row = (fields: Partial<Indicator>): Indicator => ({
  id: 'row',
  caseId: 'case-1',
  type: 'ipv4',
  value: '203.0.113.1',
  disposition: 'malicious',
  context: '',
  source: 'manual',
  blocked: false,
  ...fields,
})

describe('what is worth pushing', () => {
  it('pushes a row somebody classified as a threat', () => {
    expect(pushable(row({ disposition: 'malicious' }))).toBe(true)
    expect(pushable(row({ disposition: 'suspicious' }))).toBe(true)
  })

  it('refuses a row somebody classified as harmless', () => {
    expect(pushable(row({ disposition: 'benign' }))).toBe(false)
    expect(pushable(row({ disposition: 'clean' }))).toBe(false)
    expect(pushable(row({ disposition: '  Benign  ' }))).toBe(false)
  })

  /**
   * **A row nobody has classified is in the feed, and that is the requirement
   * rather than a preference:** *where a disposition is not one the application
   * recognises as harmless, the indicator MUST be treated as actionable, so
   * that a new disposition fails towards being seen rather than towards being
   * silently withheld.* -> `openspec/specs/data-exchange/spec.md`
   *
   * This screen used to read a blank as harmless, which failed that sentence.
   * The symptom it was written against -- every case holding a cloud app
   * reporting every indicator as pushable -- was the other half of `pushable`:
   * a cloud app has no STIX pattern, so it can never be in a bundle whatever
   * its disposition. The case below holds that half.
   */
  it('pushes a row nobody has classified', () => {
    expect(pushable(row({ disposition: '' }))).toBe(true)
    expect(pushable(row({ disposition: '   ' }))).toBe(true)
  })

  it('refuses a row no pattern can express, however it is classified', () => {
    expect(pushable(row({ type: 'cloud-app', value: 'Dropbox', disposition: '' }))).toBe(false)
    expect(pushable(row({ type: 'cloud-app', value: 'Dropbox', disposition: 'malicious' }))).toBe(
      false,
    )
  })

  it('counts an unfamiliar word as actionable, since the list excludes rather than admits', () => {
    expect(pushable(row({ disposition: 'newly-invented-verdict' }))).toBe(true)
  })
})

describe('the derivation', () => {
  const rows = collectIndicators(campaignCase)

  it('keeps every network row that carries a value', () => {
    const network = campaignCase.networkIndicators.filter((one) => one.value.trim())
    expect(rows.filter((one) => one.type !== 'cloud-app' && !isDigest(one.type))).toHaveLength(
      network.length,
    )
  })

  /**
   * The claim the screen's own docstring makes: malware digests are one of the
   * three sources. Every digest in the demo was one character over sha256, so
   * this counted zero while the screen said otherwise.
   */
  it('keeps every malware row, because every demo digest is a real sha256', () => {
    expect(rows.filter((one) => isDigest(one.type))).toHaveLength(campaignCase.malware.length)
    expect(campaignCase.malware.length).toBeGreaterThan(0)
  })

  it('skips a malware row whose hash is not a digest length', () => {
    const bent: Case = {
      ...campaignCase,
      malware: campaignCase.malware.map((one) => ({ ...one, hash: `${one.hash}f` })),
    }
    expect(collectIndicators(bent).filter((one) => isDigest(one.type))).toHaveLength(0)
  })

  it('keeps every cloud app that has a name', () => {
    expect(rows.filter((one) => one.type === 'cloud-app')).toHaveLength(
      campaignCase.cloudApps.length,
    )
  })

  it('lower-cases a digest, so one file is one indicator however it was typed', () => {
    const shouty: Case = {
      ...campaignCase,
      malware: campaignCase.malware.map((one) => ({ ...one, hash: one.hash.toUpperCase() })),
    }
    const digests = collectIndicators(shouty).filter((one) => isDigest(one.type))
    expect(digests.length).toBeGreaterThan(0)
    expect(digests.every((one) => one.value === one.value.toLowerCase())).toBe(true)
  })
})

describe('the empty-bundle warning', () => {
  it('does not fire on a case with no indicators at all', () => {
    const bare: Case = {
      ...campaignCase,
      networkIndicators: [],
      malware: [],
      cloudApps: [],
    }
    expect(collectIndicators(bare)).toHaveLength(0)
    expect(nothingToPush(collectIndicators(bare))).toBe(false)
  })

  /**
   * With the cloud apps left in, which is what the story that passed did not
   * do. A blank disposition read as actionable made this unreachable.
   */
  it('fires when every row is harmless and cloud apps are still present', () => {
    const calm: Case = {
      ...campaignCase,
      networkIndicators: campaignCase.networkIndicators.map((one) => ({
        ...one,
        disposition: 'benign',
      })),
      malware: campaignCase.malware.map((one) => ({ ...one, verdict: 'clean' })),
    }
    const rows = collectIndicators(calm)
    expect(rows.filter((one) => one.type === 'cloud-app').length).toBeGreaterThan(0)
    expect(actionableCount(rows)).toBe(0)
    expect(nothingToPush(rows)).toBe(true)
  })

  it('does not fire while one row is still worth pushing', () => {
    expect(nothingToPush(collectIndicators(campaignCase))).toBe(false)
  })

  /** The two numbers the badge contrasts differ on the demo case. */
  it('counts fewer actionable rows than derived ones', () => {
    const rows = collectIndicators(campaignCase)
    expect(actionableCount(rows)).toBeGreaterThan(0)
    expect(actionableCount(rows)).toBeLessThan(rows.length)
  })
})

/** The `type` a digest row carries, as `hashTypeOf` names it. */
function isDigest(type: string): boolean {
  return type === 'md5' || type === 'sha1' || type === 'sha256'
}

/**
 * **The badge names one column, and the box searches that column.**
 *
 * The screen's badge reads `Indicator` and the table has no such column: the
 * row *is* the indicator, and the column carrying it is `Value`. So the box
 * matches the value alone, and the four columns beside it - the type, the
 * disposition, the context and the source - are not searched.
 *
 * Written from the attack: the assertion that matters is the negative one.
 */
describe('the indicators search reads the Value column', () => {
  /** A row carrying a distinct value in each of the five fields. */
  const row: Indicator = {
    id: 'i1',
    caseId: 'case-1',
    type: 'domain',
    value: 'meridian-leaks.onion',
    disposition: 'malicious',
    context: 'the leak site',
    source: 'Defender',
    blocked: false,
  }

  it('matches a word in the value', () => {
    expect(matchesIndicator(row, 'leaks')).toBe(true)
  })

  it.each([
    ['Type', 'domain'],
    ['Disposition', 'malicious'],
    ['Context', 'leak site'],
    ['Source', 'defender'],
  ])('refuses a value that is only in %s', (_column, term) => {
    expect(matchesIndicator(row, term)).toBe(false)
  })

  it('is AND across terms, so a second word narrows rather than widens', () => {
    expect(matchesIndicator(row, 'meridian onion')).toBe(true)
    expect(matchesIndicator(row, 'meridian defender')).toBe(false)
  })

  it('leaves every row when the query is blank', () => {
    expect(collectIndicators(campaignCase).every((one) => matchesIndicator(one, '   '))).toBe(true)
  })
})

/**
 * The bundle the analyst is actually handed, which is this one.
 *
 * **The screen builds its own file rather than asking the route for it**, so
 * the server's marking table governs nothing here -- these two exporters ship
 * separately and a marking is a sharing constraint. Covered by nothing until
 * the table moved to `@contract/tlp.lists`: every level was emitted with a
 * minted `marking-definition--<level>` id, which is not an identifier and
 * which STIX 2.1 forbids as a second instance of a published marking.
 */
describe('the marking the download carries', () => {
  const bundle = (tlp: string) =>
    JSON.parse(indicatorsStix([row({ value: 'evil.test', type: 'domain' })], tlp)) as {
      objects: { type?: string; object_marking_refs?: string[] }[]
    }

  it.each([
    ['clear', 'marking-definition--94868c89-83c2-464b-929b-a1a8aa3c8487'],
    ['amber+strict', 'marking-definition--939a9414-2ddd-4d32-a0cd-375ea402b003'],
    ['amber', 'marking-definition--55d920b0-5e8b-4f79-9ee9-91f868d9b421'],
  ])('references the published id for %s', (tlp, id) => {
    const referenced = bundle(tlp).objects.flatMap((one) => one.object_marking_refs ?? [])
    expect(referenced, 'the download marked nothing').not.toEqual([])
    expect(referenced, 'a minted marking id, which no consumer resolves').toEqual([id])
  })

  /**
   * Every level is TLP 2.0, so every one travels with its own marking object:
   * a consumer has none of them by default and a bare reference is dangling.
   */
  it.each([
    ['clear', 1],
    ['green', 1],
    ['amber', 1],
    ['amber+strict', 1],
    ['red', 1],
  ] as const)('carries %s with %i marking object of its own', (tlp, carried) => {
    const markings = bundle(tlp).objects.filter((one) => one.type === 'marking-definition')
    expect(markings).toHaveLength(carried)
  })

  /**
   * `white` is `clear` under the older version of the vocabulary, and the
   * vocabulary offers one of them. The screen picks from `TLP_NAMES`, so this
   * is reachable only by a caller composing the query itself.
   */
  it('refuses the level the older version called white', () => {
    expect(() => bundle('white')).toThrow(/No TLP marking/)
  })

  it('marks nothing when no level was chosen', () => {
    const objects = bundle('').objects
    expect(objects.every((one) => one.object_marking_refs === undefined)).toBe(true)
    expect(objects.some((one) => one.type === 'marking-definition')).toBe(false)
  })
})

describe('the STIX bundle cannot be broken out of', () => {
  const patternOf = (value: string, type = 'domain'): string =>
    (JSON.parse(indicatorsStix([row({ value, type })], '')) as {
      objects: { pattern: string }[]
    }).objects[0]!.pattern

  it('escapes a quote', () => {
    expect(patternOf("evil'.test")).toBe("[domain-name:value = 'evil\\'.test']")
  })

  // A trailing backslash escapes the closing quote instead of itself.
  it('escapes a backslash', () => {
    expect(patternOf('evil\\')).toBe("[domain-name:value = 'evil\\\\']")
  })
})

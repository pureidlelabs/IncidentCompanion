/**
 * The published TLP identifiers, pinned against literals.
 *
 * **The invariant in `exports/indicators.test.ts` cannot catch a wrong id.**
 * Both the reference and the carried object read the same table entry, so a
 * typo agrees with itself and the bundle is internally consistent while
 * meaning nothing to a consumer. These are the only assertions that compare
 * what is emitted against what the specification published.
 *
 * Every value here was fetched from OASIS rather than recalled. A wrong one
 * ships a bundle MISP drops silently, which reads as an empty import.
 * -> <https://github.com/oasis-open/cti-stix-common-objects>
 */
import { describe, expect, it } from 'vitest'

import { TLP_NAMES, tlpMarking, tlpMarkingObjects } from './tlp.lists.js'

const TLP_2_EXTENSION = 'extension-definition--60a3c5c5-0d10-413e-aab3-9e08dde9e88d'

/** The four STIX 2.1 predefines, which are TLP 1.0's and mean something else. */
const TLP_1_IDS = [
  'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9',
  'marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da',
  'marking-definition--f88d31f6-486f-44da-b317-01333bde0b82',
  'marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed',
]

describe('the identifiers a marking is published under', () => {
  it.each([
    ['clear', 'marking-definition--94868c89-83c2-464b-929b-a1a8aa3c8487'],
    ['green', 'marking-definition--bab4a63c-aed9-4cf5-a766-dfca5abac2bb'],
    ['amber', 'marking-definition--55d920b0-5e8b-4f79-9ee9-91f868d9b421'],
    ['amber+strict', 'marking-definition--939a9414-2ddd-4d32-a0cd-375ea402b003'],
    ['red', 'marking-definition--e828b379-4e03-4974-9ac4-e53a884c97c1'],
  ])('references the published id for %s', (level, id) => {
    expect(tlpMarking(level), 'a marking id that is not the published one').toBe(id)
  })

  /**
   * The whole object, because a correct id inside a malformed object is still
   * dropped. `definition_type` and `definition` are absent on purpose: the
   * schema requires them only when `extensions` is not present.
   */
  it('carries a TLP 2.0 marking as published', () => {
    expect(tlpMarkingObjects('amber+strict')).toEqual([
      {
        type: 'marking-definition',
        spec_version: '2.1',
        id: 'marking-definition--939a9414-2ddd-4d32-a0cd-375ea402b003',
        created: '2022-10-01T00:00:00.000Z',
        name: 'TLP:AMBER+STRICT',
        extensions: {
          [TLP_2_EXTENSION]: { extension_type: 'property-extension', tlp_2_0: 'amber+strict' },
        },
      },
    ])
  })

  /**
   * **The version a level means, which is the half an id alone does not show.**
   *
   * STIX 2.1 predefines TLP 1.0's markings, so referencing one is the cheaper
   * thing to do -- nothing has to travel with the bundle. They also mean
   * something else, and RED is where it costs most: TLP 1.0's admits everyone
   * in "the specific exchange, meeting, or conversation", TLP 2.0's is "the
   * eyes and ears of individual recipients only". An analyst picking the
   * strictest level and shipping the older id has handed it to a room.
   *
   * Asserted through the carried object rather than the id, because the object
   * names its own version: a wrong id cannot satisfy `tlp_2_0: <level>`.
   * -> <https://www.first.org/tlp/v1/>
   */
  it.each(TLP_NAMES)('marks %s under the version the product means', (level) => {
    expect(
      TLP_1_IDS,
      'marked under TLP 1.0, whose RED admits everyone the disclosure was made to',
    ).not.toContain(tlpMarking(level))

    expect(tlpMarkingObjects(level)[0]).toMatchObject({
      extensions: { [TLP_2_EXTENSION]: { tlp_2_0: level } },
    })
  })

  /**
   * Every level travels with its own object, so a reference is never bare. The
   * exemption that let four of them travel alone went with the levels that
   * used it.
   */
  it.each(TLP_NAMES)('carries the marking it references for %s', (level) => {
    const carried = tlpMarkingObjects(level)
    expect(carried, 'a reference with nothing behind it is dangling').toHaveLength(1)
    expect(carried[0]?.['id']).toBe(tlpMarking(level))
  })

  /**
   * The vocabulary and the table are one fact: a level the picker offers and
   * nothing resolves is a 500, and one the table holds and the vocabulary
   * omits is refused by the route that validates against it.
   */
  it('resolves every level it offers, and offers every level it resolves', () => {
    for (const level of TLP_NAMES) expect(() => tlpMarking(level), level).not.toThrow()
    expect(TLP_NAMES).toEqual(['clear', 'green', 'amber', 'amber+strict', 'red'])
  })

  it('refuses a level nothing defines', () => {
    expect(() => tlpMarking('taupe')).toThrow(/No TLP marking/)
  })

  /**
   * `white` is `clear` under the older version -- "distributed without
   * restriction" against "no limit on disclosure" -- so the vocabulary offers
   * one of them rather than both.
   */
  it('refuses the level the older version called white', () => {
    expect(() => tlpMarking('white')).toThrow(/No TLP marking/)
  })
})

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

import { PREDEFINED_TLP_1_MARKINGS, TLP_NAMES, tlpMarking, tlpMarkingObjects } from './tlp.lists.js'

const TLP_2_EXTENSION = 'extension-definition--60a3c5c5-0d10-413e-aab3-9e08dde9e88d'

describe('the identifiers a marking is published under', () => {
  it.each([
    ['clear', 'marking-definition--94868c89-83c2-464b-929b-a1a8aa3c8487'],
    ['amber+strict', 'marking-definition--939a9414-2ddd-4d32-a0cd-375ea402b003'],
    ['green', 'marking-definition--bab4a63c-aed9-4cf5-a766-dfca5abac2bb'],
    ['amber', 'marking-definition--55d920b0-5e8b-4f79-9ee9-91f868d9b421'],
    ['red', 'marking-definition--e828b379-4e03-4974-9ac4-e53a884c97c1'],
    ['white', 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9'],
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
   * **A TLP 1.0 id travels by reference and must not be carried.** STIX 2.1
   * predefines those and forbids any other instance, so emitting an object for
   * one is creating a second definition of it. `white` is the only level the
   * vocabulary still resolves to one.
   */
  it.each(['white'])('carries no object for %s', (level) => {
    expect(tlpMarkingObjects(level)).toEqual([])
    expect(PREDEFINED_TLP_1_MARKINGS.has(tlpMarking(level))).toBe(true)
  })

  it.each(['clear', 'green', 'amber', 'amber+strict', 'red'])(
    'does not call %s predefined',
    (level) => {
      expect(
        PREDEFINED_TLP_1_MARKINGS.has(tlpMarking(level)),
        'a TLP 2.0 marking exempted from being carried is a dangling reference',
      ).toBe(false)
    },
  )

  /**
   * The vocabulary and the tables are one fact: a level the picker offers and
   * nothing resolves is a 500, and one the tables hold and the vocabulary
   * omits is refused by the route that validates against it.
   */
  it('resolves every level it offers, and offers every level it resolves', () => {
    for (const level of TLP_NAMES) expect(() => tlpMarking(level), level).not.toThrow()
    expect(TLP_NAMES).toEqual(['clear', 'white', 'green', 'amber', 'amber+strict', 'red'])
  })

  /**
   * **The version a level means, which is the half an id alone does not show.**
   *
   * TLP 1.0's AMBER admits the recipient's organisation *and its clients*;
   * 2.0's is the organisation alone. Both are spelled `TLP:AMBER`, so a bundle
   * marked under the older one grants a wider audience than the analyst chose
   * and nothing on either end says so.
   *
   * Asserted through the carried object rather than the id, because the object
   * names its own version: a wrong id cannot satisfy `tlp_2_0: <level>`.
   */
  it.each(['green', 'amber', 'red'])('marks %s under the version the product means', (level) => {
    expect(
      PREDEFINED_TLP_1_MARKINGS.has(tlpMarking(level)),
      'marked under TLP 1.0, whose AMBER admits the recipient organisation clients as well',
    ).toBe(false)

    expect(tlpMarkingObjects(level)[0]).toMatchObject({
      extensions: { [TLP_2_EXTENSION]: { tlp_2_0: level } },
    })
  })

  it('refuses a level nothing defines', () => {
    expect(() => tlpMarking('taupe')).toThrow(/No TLP marking/)
  })
})

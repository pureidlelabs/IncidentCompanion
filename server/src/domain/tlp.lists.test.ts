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
    ['white', 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9'],
    ['green', 'marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da'],
    ['amber', 'marking-definition--f88d31f6-486f-44da-b317-01333bde0b82'],
    ['red', 'marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed'],
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
   * **The four TLP 1.0 ids travel by reference and must not be carried.**
   * STIX 2.1 predefines them and forbids any other instance, so emitting an
   * object for one is creating a second definition of it.
   */
  it.each(['white', 'green', 'amber', 'red'])('carries no object for %s', (level) => {
    expect(tlpMarkingObjects(level)).toEqual([])
    expect(PREDEFINED_TLP_1_MARKINGS.has(tlpMarking(level))).toBe(true)
  })

  it.each(['clear', 'amber+strict'])('does not call %s predefined', (level) => {
    expect(
      PREDEFINED_TLP_1_MARKINGS.has(tlpMarking(level)),
      'a TLP 2.0 marking exempted from being carried is a dangling reference',
    ).toBe(false)
  })

  /**
   * The vocabulary and the tables are one fact: a level the picker offers and
   * nothing resolves is a 500, and one the tables hold and the vocabulary
   * omits is refused by the route that validates against it.
   */
  it('resolves every level it offers, and offers every level it resolves', () => {
    for (const level of TLP_NAMES) expect(() => tlpMarking(level), level).not.toThrow()
    expect(TLP_NAMES).toEqual(['clear', 'white', 'green', 'amber', 'amber+strict', 'red'])
  })

  it('refuses a level nothing defines', () => {
    expect(() => tlpMarking('taupe')).toThrow(/No TLP marking/)
  })
})

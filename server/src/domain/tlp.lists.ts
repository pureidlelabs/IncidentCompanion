/**
 * The TLP markings an export may carry, and how each one travels.
 *
 * **Here rather than beside either exporter, because there are two of them.**
 * The server builds a bundle of the whole case and the screen builds one of
 * the rows on it, and a marking is a sharing constraint: two builders that
 * disagree about it is one of them handing out data under a rule the other
 * refused. The `@contract` alias is what lets the browser read this.
 *
 * **Every id is assigned by a specification and none is minted.** A generated
 * marking id produces a bundle that parses and whose marking means nothing,
 * and MISP drops a non-conforming object silently -- so the symptom is an
 * empty import rather than an error.
 *
 * **The two TLP versions do not travel the same way, which is why they are
 * two tables.** STIX 2.1 predefines TLP 1.0's four markings and forbids any
 * other instance of them, so a reference alone is complete. TLP 2.0's are
 * property-extension objects no consumer has by default, so a bundle that
 * only references one is dangling.
 *
 * The vocabulary spans both on purpose: `white` is TLP 1.0 and `clear` its
 * TLP 2.0 successor, so a bundle can be marked for a consumer speaking either.
 */

/** TLP 1.0, predefined by STIX 2.1 s7.2.1.4 and referenced without carrying. */
const TLP_1_MARKINGS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    white: 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9',
    green: 'marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da',
    amber: 'marking-definition--f88d31f6-486f-44da-b317-01333bde0b82',
    red: 'marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed',
  }),
)

/**
 * The ids a bundle may reference without carrying an object for them.
 *
 * A marking outside this set has to travel with the bundle, which is what
 * `tlpMarkingObjects` answers.
 */
export const PREDEFINED_TLP_1_MARKINGS: ReadonlySet<string> = new Set(TLP_1_MARKINGS.values())

/** The extension every TLP 2.0 marking declares itself through. */
const TLP_2_EXTENSION = 'extension-definition--60a3c5c5-0d10-413e-aab3-9e08dde9e88d'

/**
 * The timestamp the TLP 2.0 objects carry, which is theirs and not a bundle's:
 * it is part of the published object, like the id.
 */
const TLP_2_CREATED = '2022-10-01T00:00:00.000Z'

/** TLP 2.0, which STIX 2.1 does not predefine. */
const TLP_2_MARKINGS: ReadonlyMap<string, { id: string; name: string }> = new Map(
  Object.entries({
    clear: { id: 'marking-definition--94868c89-83c2-464b-929b-a1a8aa3c8487', name: 'TLP:CLEAR' },
    'amber+strict': {
      id: 'marking-definition--939a9414-2ddd-4d32-a0cd-375ea402b003',
      name: 'TLP:AMBER+STRICT',
    },
  }),
)

/**
 * The vocabulary, in the order the level tightens.
 *
 * `white` sits beside `clear` rather than in sequence, being the same level
 * under the older version.
 */
export const TLP_NAMES = ['clear', 'white', 'green', 'amber', 'amber+strict', 'red']

/** The id to reference, or a throw for a level nothing defines. */
export function tlpMarking(tlp: string): string {
  const level = tlp.toLowerCase()
  const marking = TLP_1_MARKINGS.get(level) ?? TLP_2_MARKINGS.get(level)?.id
  if (!marking) throw new Error(`No TLP marking ${tlp}.`)
  return marking
}

/**
 * The objects a bundle has to carry so the marking it references resolves.
 *
 * Empty for a TLP 1.0 level, because those are predefined. For a TLP 2.0 one
 * it is the marking itself, reproduced as published rather than built from a
 * clock. The `extension-definition` it names is deliberately not carried:
 * STIX 2.1 s7.3 leaves that to the producer, and OASIS's own TLP 2.0 examples
 * carry neither.
 */
export function tlpMarkingObjects(tlp: string): Record<string, unknown>[] {
  const level = tlp.toLowerCase()
  const marking = TLP_2_MARKINGS.get(level)
  if (!marking) return []
  return [
    {
      type: 'marking-definition',
      spec_version: '2.1',
      id: marking.id,
      created: TLP_2_CREATED,
      name: marking.name,
      extensions: {
        [TLP_2_EXTENSION]: { extension_type: 'property-extension', tlp_2_0: level },
      },
    },
  ]
}

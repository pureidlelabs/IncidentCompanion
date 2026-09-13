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
 * **The vocabulary is TLP 2.0 throughout, and the older ids are not reachable.**
 * STIX 2.1 predefines TLP 1.0's four markings, which makes them the cheaper
 * thing to reference -- they need no object carried. They also mean something
 * else. RED is the level that shows it: 1.0 admits everyone in "the specific
 * exchange, meeting, or conversation", where 2.0 is "the eyes and ears of
 * individual recipients only". An analyst choosing the strictest level and
 * getting the older id has shared it with a room.
 *
 * So a level resolves to its 2.0 marking, which is a property-extension object
 * no consumer has by default and therefore travels with the bundle.
 * -> <https://www.first.org/tlp/> and <https://www.first.org/tlp/v1/>
 */

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
    green: { id: 'marking-definition--bab4a63c-aed9-4cf5-a766-dfca5abac2bb', name: 'TLP:GREEN' },
    amber: { id: 'marking-definition--55d920b0-5e8b-4f79-9ee9-91f868d9b421', name: 'TLP:AMBER' },
    'amber+strict': {
      id: 'marking-definition--939a9414-2ddd-4d32-a0cd-375ea402b003',
      name: 'TLP:AMBER+STRICT',
    },
    red: { id: 'marking-definition--e828b379-4e03-4974-9ac4-e53a884c97c1', name: 'TLP:RED' },
  }),
)

/**
 * The vocabulary, in the order the level tightens.
 *
 * The same five the report side offers, and for the same reason: a report
 * marked at a level and a feed of its indicators marked at another is one
 * case saying two things about who may hold it.
 * -> `domain/entities/report.ts`
 */
export const TLP_NAMES = ['clear', 'green', 'amber', 'amber+strict', 'red']

/** The id to reference, or a throw for a level nothing defines. */
export function tlpMarking(tlp: string): string {
  const marking = TLP_2_MARKINGS.get(tlp.toLowerCase())?.id
  if (!marking) throw new Error(`No TLP marking ${tlp}.`)
  return marking
}

/**
 * The objects a bundle has to carry so the marking it references resolves.
 *
 * Every level carries one: a TLP 2.0 marking is a property-extension object
 * that no consumer has by default, so a reference with nothing behind it is
 * dangling. Reproduced as published rather than built from a clock. The
 * `extension-definition` it names is deliberately not carried: STIX 2.1 s7.3
 * leaves that to the producer, and OASIS's own TLP 2.0 examples carry neither.
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

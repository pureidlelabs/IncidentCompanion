/**
 * How a name that needs a qualifier is written, wherever it is shown.
 *
 * **One spelling, because there were three.** The Sentinel mapper's label, the
 * report's cloud-app cell and the STIX export each built `Name (instance)`
 * from their own template literal. It is the display form of an *identity
 * pair*, so a drift between the screen an analyst approves an import on and
 * the report they hand over is a drift in what two rows are.
 *
 * **This file imports nothing**, so the client can value-import it;
 * `vocabularies.lists.test.ts` holds that for every `*.lists.ts`.
 */

/** `name` when there is no qualifier, `name (qualifier)` when there is. */
export function qualified(name: string, qualifier: string): string {
  const tail = qualifier.trim()
  return tail ? `${name} (${tail})` : name
}

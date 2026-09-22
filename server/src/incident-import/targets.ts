/**
 * Which collections an import may write, and the definitions it writes through.
 *
 * **One list, because a copy of it cannot guard it.** Every suite here used to
 * declare its own and rebuild `definitions()` from it, so a test asserting
 * something about *what an import writes* was asserting it about its own
 * fixture -- a collection added to the shipping list stayed unexamined.
 */
import { DEFINITIONS } from '../collections/definitions.js'
import type { BulkTarget } from '../domain/collections.js'
import type { ImportDefinitions } from './import.service.js'

/**
 * **A literal tuple of bulk targets**: a name here that is not one is a type
 * error. The reverse does not hold -- this is a subset of the registry rather
 * than a second copy of it, and a collection added to `TABLES` is simply not
 * imported until it is named here too.
 */
export const IMPORT_TARGETS = [
  'systems',
  'accounts',
  'network_indicators',
  'malware',
  'cloud_apps',
] as const satisfies readonly BulkTarget[]

/**
 * **The shipping definitions, never rebuilt.** A hand-written
 * copy is a second door that a guard added to the first never reaches -- a
 * timeline definition without `schemaFor` loses the whole reference check on an
 * imported entry the analyst edits.
 */
export function definitions(): ImportDefinitions {
  return {
    byName: Object.fromEntries(IMPORT_TARGETS.map((name) => [name, DEFINITIONS[name]])),
    timeline: DEFINITIONS.timeline,
  }
}

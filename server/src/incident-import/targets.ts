/**
 * Which collections an import may write, and the definitions it writes through.
 *
 * **One list, because a copy of it cannot guard it.** Every suite here used to
 * declare its own and rebuild `definitions()` from it, so a test asserting
 * something about *what an import writes* was asserting it about its own
 * fixture -- a collection added to the shipping list stayed unexamined.
 */
import { ordered } from '../collections/entities.controller.js'
import { TABLES } from '../collections/registry.js'
import { DEFINITION as TIMELINE_DEFINITION } from '../collections/timeline.controller.js'
import type { ImportDefinitions } from './import.service.js'

/**
 * **A literal tuple, so `TABLES` is indexed by a name it knows**: a name here
 * that is not a bulk target is a type error. The reverse does not hold -- this
 * is a subset of the registry rather than a second copy of it, and a collection
 * added to `TABLES` is simply not imported until it is named here too.
 */
export const IMPORT_TARGETS = [
  'systems',
  'accounts',
  'network_indicators',
  'malware',
  'cloud_apps',
] as const

/**
 * **The shipping controllers' own definitions, never rebuilt.** A hand-written
 * copy is a second door that a guard added to the first never reaches -- a
 * timeline definition without `schemaFor` loses the whole reference check on an
 * imported entry the analyst edits.
 */
export function definitions(): ImportDefinitions {
  return {
    byName: Object.fromEntries(IMPORT_TARGETS.map((name) => [name, ordered(name, TABLES[name])])),
    timeline: TIMELINE_DEFINITION,
  }
}

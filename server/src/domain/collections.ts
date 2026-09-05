/**
 * One record per collection - everything true of it that needs no database.
 *
 * **The ten collection names were declared seven times in three spellings**:
 * `BULK_TARGETS`, `TABLES`, `REVIEWABLE`, `TARGETS`, `SCREEN_KEY`/`NOUNS`,
 * `COLLECTION_SCHEMAS`, and the `refTarget` literals on the entity schemas. The
 * branch review of 2026-08-12 found four defects that were each one entry
 * missing from one of those maps, and the worst was created by an earlier fix
 * that updated one of two call sites. Each is derived here or in
 * `collections/registry.ts` now, so a collection is one entry and a missing
 * map is a type error rather than a blank chip.
 *
 * **One roster still is not**: `specs/collections.controller.ts` hand-writes
 * the ten name->schema pairs it publishes, and no test compares that set to
 * this record.
 *
 * **The Drizzle tables are bound in `collections/registry.ts`, and the layering
 * is why.** `domain` may import nothing and `specs` may import only `domain`
 * (`architecture.test.ts`), so the half that names a table cannot live where
 * the specs controller can read it. That binding is a
 * `Record<Collection, PgTable>`, which the compiler holds total against this
 * record - not a second list.
 */
import type { z } from 'zod'

import { accountSchema } from './entities/account.js'
import { actionSchema } from './entities/action.js'
import { caseNoteSchema } from './entities/case-note.js'
import { cloudAppSchema } from './entities/cloud-app.js'
import { evidenceSchema } from './entities/evidence.js'
import { impactSchema } from './entities/impact.js'
import { malwareSchema } from './entities/malware.js'
import { methodSchema } from './entities/method.js'
import { networkIndicatorSchema } from './entities/network-indicator.js'
import { systemSchema } from './entities/system.js'
import { reportBlockSchema } from './entities/report.js'
import { actionWriteSchema, eventWriteSchema } from './entities/timeline.js'
import { referenceFieldsOf } from './references.js'

export interface CollectionDef {
  /**
   * The schema a whole row validates against, where the collection has one.
   * Absent means the collection cannot be imported: an import writes rows and
   * has nothing to check them with.
   */
  readonly schema?: z.ZodObject
  /**
   * Whether a bulk selection may name it - which is also whether it exports.
   * A refused save can be reviewed against every entry here whatever this says.
   */
  readonly bulk: boolean
  /**
   * The client's `ENTITY_TARGETS` key, for a collection a reference can point
   * at. **Not the collection name**: `cloud_apps` is the `cloud_app` screen and
   * `network_indicators` is `network`, so it is a decision rather than a
   * transformation, and serving the collection in both fields resolved every
   * reference cell to nothing - measured 2026-08-10.
   */
  readonly screenKey?: string
  /** What a reference picker calls one of its rows. */
  readonly noun?: string
}

export const COLLECTIONS = {
  systems: {
    schema: systemSchema,
    bulk: true,
    screenKey: 'system',
    // **"asset", which is the analyst's word.** The collection is `systems` on
    // the wire and every layer a person reads says Assets - the rail row, the
    // screen, the scope chip. A picker offering "New host" is the one place the
    // wire's noun leaked out.
    noun: 'asset',
  },
  accounts: { schema: accountSchema, bulk: true, screenKey: 'account', noun: 'account' },
  malware: { schema: malwareSchema, bulk: true, screenKey: 'malware', noun: 'malware sample' },
  network_indicators: {
    schema: networkIndicatorSchema,
    bulk: true,
    screenKey: 'network',
    noun: 'network indicator',
  },
  impact: { schema: impactSchema, bulk: true },
  cloud_apps: { schema: cloudAppSchema, bulk: true, screenKey: 'cloud_app', noun: 'cloud app' },
  evidence: { schema: evidenceSchema, bulk: true, screenKey: 'evidence', noun: 'evidence' },
  /**
   * **Bulk, where `evidence` is not.** A method row describes an act and holds
   * no bytes, so nothing about a batch door mints a record claiming a file
   * nobody uploaded - which is the one reason `evidence` is excluded.
   */
  methods: { schema: methodSchema, bulk: true, screenKey: 'method', noun: 'method' },
  /**
   * **No schema, on purpose.** A timeline row's patchable fields depend on its
   * `kind` - an event and an action validate against different schemas - so
   * pretending there is one would let an import write an action's fields onto
   * an event. -> `collections/timeline.controller.ts`
   */
  timeline: { bulk: true },
  actions: { schema: actionSchema, bulk: true },
  casenotes: { schema: caseNoteSchema, bulk: true },
  /**
   * **Reviewable, and neither bulk-deletable nor importable.** Anything written
   * under a version check can refuse a save, and reports are; a selection has
   * never been able to name one. Widening `bulk` to close the gap in the review
   * list is what made reports exportable and deletable as a side effect.
   * -> `collections/conflicts.service.ts`
   */
  reports: { bulk: false },
  report_blocks: { bulk: false },
} as const satisfies Record<string, CollectionDef>

export type Collection = keyof typeof COLLECTIONS

/** The collections a selection may name, spelled as the client spells them. */
export type BulkTarget = {
  [K in Collection]: (typeof COLLECTIONS)[K]['bulk'] extends true ? K : never
}[Collection]

/** The cast is the one `Object.entries` always costs: it widens the key to `string`. */
const ENTRIES = Object.entries(COLLECTIONS) as [Collection, CollectionDef][]

export const BULK_TARGETS = ENTRIES.filter(([, def]) => def.bulk).map(
  ([name]) => name,
) as BulkTarget[]

/** Which Zod schema validates a row of which collection. */
export const COLLECTION_SCHEMAS: Readonly<Record<string, z.ZodObject>> = Object.fromEntries(
  ENTRIES.flatMap(([name, def]) => (def.schema ? [[name, def.schema] as const] : [])),
)

/**
 * The route's own patch schema, re-exported through the door the client has.
 *
 * `field-spec.ts` is already inside this module's import closure -
 * `browser-safe.test.ts` asserts it by name - so this opens nothing new. It
 * saves the evaluation build from copying what a patch is judged by, which is
 * the one thing that would let the two drift.
 */
export { patchSchema } from './field-spec.js'

/** The collections an import can write, which is every one with a single schema. */
export const IMPORTABLE = Object.keys(COLLECTION_SCHEMAS)

/**
 * The timeline's two write schemas, by the kind that discriminates them.
 *
 * **Because `COLLECTION_SCHEMAS` cannot hold them and a client still needs
 * one.** A row's patchable fields depend on whether it is an event or an
 * activity, so the collection publishes no single schema - and the event
 * dialog therefore validated nothing at all, since `problemsIn('timeline', ..)`
 * took its "no schema" branch and passed every draft. The dialog knows which
 * kind it is drawing; this is where it comes to fetch the matching schema.
 *
 * **Here rather than imported from `entities/timeline` directly**, because
 * `collections` is the door the client's `no-restricted-imports` allows
 * through - and that allowance exists for exactly this: `safeParse` on a draft,
 * so a refusal lands on the field that is wrong rather than on a save.
 */
export const TIMELINE_WRITE_SCHEMAS = {
  event: eventWriteSchema,
  action: actionWriteSchema,
} as const

/**
 * Every schema a reference can be declared on.
 *
 * **Wider than `COLLECTION_SCHEMAS`**, which omits any collection whose schema
 * is supplied another way: the timeline's two write schemas, and
 * `report_blocks` through `schemaFor`. Read this, not that, when the question
 * is where a reference can be declared.
 */
export const REFERENCING_SCHEMAS: readonly z.ZodObject[] = [
  ...Object.values(COLLECTION_SCHEMAS),
  eventWriteSchema,
  actionWriteSchema,
  reportBlockSchema,
]

/**
 * Every field name that carries a reference, across every collection.
 *
 * Names only: an id is unique across the install, so a caller remapping one
 * does not need the table it came from.
 */
export const REFERENCE_FIELD_NAMES: ReadonlySet<string> = new Set(
  REFERENCING_SCHEMAS.flatMap((schema) => referenceFieldsOf(schema).map((one) => one.field)),
)

export const SCREEN_KEY: Readonly<Record<string, string>> = Object.fromEntries(
  ENTRIES.flatMap(([name, def]) => (def.screenKey ? [[name, def.screenKey] as const] : [])),
)

export const NOUNS: Readonly<Record<string, string>> = Object.fromEntries(
  ENTRIES.flatMap(([name, def]) => (def.noun ? [[name, def.noun] as const] : [])),
)

/**
 * Every entity collection a case carries, in the shell's own vocabulary.
 *
 * **Not `COLLECTIONS` above, and the difference is the spelling.** That map is
 * snake_case because it is what a *route* is named after and what a selection
 * sends; these are the document's own keys, which are camelCase. Two lists
 * because there are two wire vocabularies, not because one drifted - and this
 * one lives in `domain/` so the client's rail type derives from it.
 *
 * **Named here rather than derived from the tables**, because the rail needs
 * all twelve before any of them exists - and a list that grew as tables landed
 * would draw a rail that changed shape mid-rewrite.
 */
export const CASE_COLLECTIONS = [
  'timeline',
  'systems',
  'accounts',
  'networkIndicators',
  'impact',
  'malware',
  'cloudApps',
  'evidence',
  'methods',
  'actions',
  'casenotes',
  'reports',
  'reportBlocks',
] as const

export type CaseCollection = (typeof CASE_COLLECTIONS)[number]

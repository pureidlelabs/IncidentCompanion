/**
 * One record per collection - everything true of it that needs no database.
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
   */
  readonly schema?: z.ZodObject
  /**
   * Whether a bulk selection may name it - which is also whether it exports.
   * A refused save can be reviewed against every entry here whatever this says.
   */
  readonly bulk: boolean
  /**
   * The client's `ENTITY_TARGETS` key, for a collection a reference can point
   * at.
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
   * **Bulk, where `evidence` is not.**
   */
  methods: { schema: methodSchema, bulk: true, screenKey: 'method', noun: 'method' },
  /**
   * **No schema, on purpose.**
   */
  timeline: { bulk: true },
  actions: { schema: actionSchema, bulk: true },
  casenotes: { schema: caseNoteSchema, bulk: true },
  /**
   * **Reviewable, and neither bulk-deletable nor importable.**
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
 */
export { patchSchema } from './field-spec.js'

/** The collections an import can write, which is every one with a single schema. */
export const IMPORTABLE = Object.keys(COLLECTION_SCHEMAS)

/**
 * The timeline's two write schemas, by the kind that discriminates them.
 */
export const TIMELINE_WRITE_SCHEMAS = {
  event: eventWriteSchema,
  action: actionWriteSchema,
} as const

/**
 * Every schema a reference can be declared on.
 */
export const REFERENCING_SCHEMAS: readonly z.ZodObject[] = [
  ...Object.values(COLLECTION_SCHEMAS),
  eventWriteSchema,
  actionWriteSchema,
  reportBlockSchema,
]

/**
 * Every field name that carries a reference, across every collection.
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

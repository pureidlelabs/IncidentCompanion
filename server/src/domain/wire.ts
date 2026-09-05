/**
 * What a case row looks like on the wire - the one description, read by both
 * ends. The React client maps `@contract/*` here and reads these as
 * `import type`, so a schema change is a client compile error in the same
 * `tsc` run.
 *
 * **Type-only, in both directions.** A type-only import is erased before the
 * bundler sees it, which is what lets the client read the server's types with
 * no alias and nothing in the bundle; a *value* export from here would need
 * zod and a Vite alias in the client. Nothing here imports Drizzle for the
 * same reason - `wire.contract.test.ts` binds every row to its table and fails
 * the typecheck when they disagree.
 *
 * **Timestamps are strings.** JSON has no date, so a column Drizzle hands back
 * as a `Date` reaches the client as an ISO string.
 */
import type { z } from 'zod'

import type { SCOPES } from './scopes.lists.js'

import type { caseReadSchema } from './case.js'
import type { accountSchema } from './entities/account.js'
import type { actionSchema } from './entities/action.js'
import type { caseNoteSchema } from './entities/case-note.js'
import type { cloudAppSchema } from './entities/cloud-app.js'
import type { evidenceSchema } from './entities/evidence.js'
import type { methodSchema } from './entities/method.js'
import type { impactSchema } from './entities/impact.js'
import type { malwareSchema } from './entities/malware.js'
import type { networkIndicatorSchema } from './entities/network-indicator.js'
import type { reportBlockSchema, reportSchema } from './entities/report.js'
import type { systemSchema } from './entities/system.js'
import type { actionSchema as timelineActionSchema, eventSchema } from './entities/timeline.js'

/**
 * What every case-owned row carries beyond its own fields.
 *
 * **`version` is the reason this type exists**: a row type without one cannot
 * describe a legal patch, so omitting it is a compile error rather than a 400
 * the analyst meets.
 *
 * **`createdBy` is nullable** - the reference is `set null`, so deleting an
 * analyst leaves the row with its authorship unknown rather than deleting
 * their work. -> `db/schema/columns.ts`
 */
export interface RowMeta {
  id: string
  caseId: string
  /** Starts at 1. Presented on every single-row write and matched on. */
  version: number
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

/**
 * Which door the row came through - `manual`, or the importer that wrote it.
 *
 * **Server-owned, so it is on the row and not in the schema.** A client that
 * could set it could claim an analyst typed what a CSV supplied. `impact` is
 * the one entity without it: a conclusion has no importer to come from.
 */
export interface EntrySource {
  source: string
}

type Payload<S> = S extends z.ZodType ? z.infer<S> : never

/** A stored row: what the analyst filled in, plus what the server owns. */
type Row<S> = Payload<S> & RowMeta

export type SystemRow = Row<typeof systemSchema> & EntrySource
export type AccountRow = Row<typeof accountSchema> & EntrySource
export type MalwareRow = Row<typeof malwareSchema> & EntrySource
export type NetworkIndicatorRow = Row<typeof networkIndicatorSchema> & EntrySource
export type CloudAppRow = Row<typeof cloudAppSchema> & EntrySource
/**
 * How a finding was obtained. **No `EntrySource`**: a method *is* the record of
 * where something came from, so a column saying where the record came from
 * would be the same claim twice.
 */
export type MethodRow = Row<typeof methodSchema>

export type ImpactRow = Row<typeof impactSchema>
export type ActionRow = Row<typeof actionSchema>
export type CaseNoteRow = Row<typeof caseNoteSchema>

/**
 * A report and its sections.
 *
 * **`report_blocks` carries no body.** A written section's text is a CRDT
 * keyed by the block id, so the row has nowhere to keep it, and `hasProse` is
 * the server answering the question a `body` column used to.
 */
export type ReportRow = Row<typeof reportSchema> & {
  /**
   * When it went out. **On the row and not in the schema**, exactly like
   * evidence's `hash`: a client that could set it would stamp a report sent
   * without the freeze that makes a sent report mean anything.
   * -> `report/freeze.ts`
   */
  sentAt: string | null
}
export type ReportBlockRow = Row<typeof reportBlockSchema> & {
  /**
   * **Derived per read, never stored.** A second copy of "is there text"
   * disagrees with the document the moment somebody types into it.
   */
  hasProse: boolean
}

/**
 * **Computed from the stored file, never accepted from a caller.** A digest
 * taken on a caller's word is a claim about nothing - the verification that
 * checks the file against it becomes circular. -> `db/schema/entities.ts`
 */
export type EvidenceRow = Row<typeof evidenceSchema> & {
  hash: string
  /**
   * Which function produced the digest. **Here and not in the schema, because
   * it names `hash`** - a client that could set it could leave the row saying
   * `md5` over a SHA-256 digest, and the verification then fails on an intact
   * artefact. The upload writes both or neither.
   */
  hashAlgorithm: string | null
  /** Set when this install holds the bytes. Null is the ordinary case. */
  storedAt: string | null
  sizeBytes: number | null
  contentType: string | null
  /** What it was called where it came from, which the digest does not say. */
  originalFilename: string
}

/**
 * Where the entry sits in the Unified Kill Chain - **derived by the server,
 * and on the event arm only.**
 *
 * Not in the schema because it is not written: it is a function of `tactic`,
 * `technique` and `ukcOverride`, all of which are. An action carries neither
 * field - it is what the SOC did, so it has no tactic to derive from.
 * -> `domain/killchain.ts`
 *
 * Both are `''` for an entry with nothing to place, which every consumer reads
 * as "leave it out of the chain" - `policy violation` included.
 */
export interface KillChainPlacement {
  ukcPhase: string
  /**
   * **The closed vocabulary, not `string`.** It was the latter, so the response
   * schema could not publish the four values it actually sends and a client
   * switching on it had no exhaustiveness to lean on. `ukcPhase` stays `string`
   * because the override widens it past `UKC_PHASE`.
   */
  ukcCycle: 'in' | 'through' | 'out' | ''
}

export type TimelineEventRow = Payload<typeof eventSchema> &
  Omit<RowMeta, 'id'> &
  KillChainPlacement
export type TimelineActionRow = Payload<typeof timelineActionSchema> & Omit<RowMeta, 'id'>

/**
 * A timeline row: **the discriminated union, never the column set.** One table
 * holds both kinds, so a `SELECT *` returns columns that mean nothing for an
 * action; `timelineToWire` projects each row onto its own arm, and `kind`
 * narrows to exactly what is there.
 *
 * `id` is already on the arms through `owned()`, so only the rest of the
 * envelope is added.
 */
export type TimelineRow = TimelineEventRow | TimelineActionRow

/**
 * Collection name to row type. **Keyed by the name the route uses**, so a
 * client that can spell the path can name the type.
 *
 * **`timeline` is here despite having its own controller and its own write
 * union** - `COLLECTION_SCHEMAS` still omits it for that reason, and this map
 * answers a different question: what a *read* of that collection returns. The
 * client held a flattened Python shape for it while both halves of the union
 * were declared right here, and every screen read an event's fields off a
 * response record. -> `collections.ts`
 */
export interface CollectionRows {
  timeline: TimelineRow
  systems: SystemRow
  accounts: AccountRow
  malware: MalwareRow
  network_indicators: NetworkIndicatorRow
  impact: ImpactRow
  cloud_apps: CloudAppRow
  evidence: EvidenceRow
  methods: MethodRow
  actions: ActionRow
  casenotes: CaseNoteRow
  reports: ReportRow
  report_blocks: ReportBlockRow
}

export type CollectionName = keyof CollectionRows

/**
 * Everything a write may announce it touched.
 *
 * **A union rather than `string[]`, because the client turns each one into a
 * query key and a cast is the fallback it would otherwise take.** A scope that
 * is not a collection produces a key no query ever reads: the invalidation
 * runs, the screen does not refresh, and the symptom appears minutes later on
 * another analyst's monitor. The spellings a cast admits are `'case'` for
 * `'cases'`, `'cases'` invalidating ten keys where four are meant, and
 * `'case_compliance'` never repainting an open Compliance screen at all.
 *
 * **The two non-collection members are the whole reason this is not just
 * `CollectionScope`.** A case's own scalars and its compliance record are
 * written through their own routes and keyed outside the collection
 * convention, so each needs a branch that says so in one place.
 */
export type Scope = CollectionName | 'cases' | 'case_compliance'

/**
 * **A member missing from `SCOPES` is a compile error naming it, in both
 * directions.**
 *
 * `satisfies` alone only proves every listed string is a scope; a short list
 * is silent, and the scope simply never announces. `identity.ts` records the
 * same shape costing a whole collection's dedup under two spellings of one
 * name.
 */
type ScopesAreComplete = Exclude<Scope, (typeof SCOPES)[number]>
const _everyScopeIsListed: ScopesAreComplete extends never ? true : ScopesAreComplete = true
void _everyScopeIsListed
type ScopesAreAllScopes = Exclude<(typeof SCOPES)[number], Scope>
const _everyListedIsAScope: ScopesAreAllScopes extends never ? true : ScopesAreAllScopes = true
void _everyListedIsAScope

/**
 * A case as a *read* returns it - the row's own fields, no collections.
 *
 * **`z.infer` of a schema, like every other row here.** The write and read
 * shapes genuinely differ - the form coerces every stamp to a `Date` and a
 * client receives an ISO string - so `caseRowSchema` derives from the form and
 * swaps them, rather than this being written out a second time.
 * -> `case.ts`
 *
 * **The compliance record is not here, and that is the point.** Its 49 fields
 * are a separate row with a version of its own, so a threshold answered on the
 * compliance screen does not move `cases.version`.
 * -> `compliance/compliance.controller.ts`
 *
 * **`rsitClass` and `rsitType` are typed as strings, not as their enums.**
 * They are served columns the case *form* omits on purpose - the pair validates
 * together - so no live schema states their vocabulary. `caseFactsSchema` does,
 * and has no consumer; narrowing them here would claim a guarantee no write
 * path enforces.
 */
export type CaseRow = Payload<typeof caseReadSchema>

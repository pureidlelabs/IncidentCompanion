/**
 * What a case row looks like on the wire - the one description, read by both
 * ends.
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
 * How a finding was obtained.
 */
export type MethodRow = Row<typeof methodSchema>

export type ImpactRow = Row<typeof impactSchema>
export type ActionRow = Row<typeof actionSchema>
export type CaseNoteRow = Row<typeof caseNoteSchema>

/**
 * A report and its sections.
 */
export type ReportRow = Row<typeof reportSchema> & {
  /**
   * When it went out.
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
 * **Computed from the stored file, never accepted from a caller.**
 */
export type EvidenceRow = Row<typeof evidenceSchema> & {
  hash: string
  /**
   * Which function produced the digest.
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
 */
export interface KillChainPlacement {
  ukcPhase: string
  /**
   * **The closed vocabulary, not `string`.**
   */
  ukcCycle: 'in' | 'through' | 'out' | ''
}

export type TimelineEventRow = Payload<typeof eventSchema> &
  Omit<RowMeta, 'id'> &
  KillChainPlacement
export type TimelineActionRow = Payload<typeof timelineActionSchema> & Omit<RowMeta, 'id'>

/**
 * A timeline row: **the discriminated union, never the column set.**
 */
export type TimelineRow = TimelineEventRow | TimelineActionRow

/**
 * Collection name to row type. **Keyed by the name the route uses**, so a
 * client that can spell the path can name the type.
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
 */
export type Scope = CollectionName | 'cases' | 'case_compliance'

/**
 * **A member missing from `SCOPES` is a compile error naming it, in both
 * directions.**
 */
type ScopesAreComplete = Exclude<Scope, (typeof SCOPES)[number]>
const _everyScopeIsListed: ScopesAreComplete extends never ? true : ScopesAreComplete = true
void _everyScopeIsListed
type ScopesAreAllScopes = Exclude<(typeof SCOPES)[number], Scope>
const _everyListedIsAScope: ScopesAreAllScopes extends never ? true : ScopesAreAllScopes = true
void _everyListedIsAScope

/**
 * A case as a *read* returns it - the row's own fields, no collections.
 */
export type CaseRow = Payload<typeof caseReadSchema>

/**
 * That the wire contract still describes the tables it claims to.
 */
import { describe, expect, it } from 'vitest'

import {
  accounts,
  cloudApps,
  evidence,
  impact,
  malware,
  methods,
  networkIndicators,
  systems,
} from '../db/schema/entities.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { REVIEWABLE } from '../collections/registry.js'
import type { TimelineRowShape } from './entities/timeline.js'
import { cases } from '../db/schema/case.js'
import { timeline } from '../db/schema/timeline.js'
import { actions, caseNotes } from '../db/schema/tracker.js'
import type {
  AccountRow,
  ActionRow,
  CaseNoteRow,
  CaseRow,
  CloudAppRow,
  EvidenceRow,
  ImpactRow,
  MalwareRow,
  MethodRow,
  NetworkIndicatorRow,
  ReportBlockRow,
  ReportRow,
  SystemRow,
  TimelineActionRow,
  TimelineEventRow,
  TimelineRow,
} from './wire.js'

/** What `JSON.stringify` does to a row on its way out: a `Date` becomes a string. */
type Wire<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K]
}

/**
 * Mutual assignability.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/** The row declares exactly the table's columns - no more, no fewer. */
type SameKeys<Row, Table> = Exact<keyof Plain<Row>, keyof Table>

/** Every field is assignable to its column's wire type, and may be narrower. */
type Narrows<Row, Table> = [Plain<Row>] extends [Wire<Table>] ? true : false

/**
 * The same check for one arm of a union: its own fields match their columns,
 * and it is not expected to carry the ones belonging to the other kind.
 */
type ArmNarrows<Arm, Table> = [Plain<Arm>] extends [
  Pick<Wire<Table>, keyof Plain<Arm> & keyof Table>,
]
  ? true
  : false

/**
 * Read-only modifiers are not part of the wire shape - they are advice to the
 * holder - so they are stripped before comparing.
 */
type Plain<T> = { -readonly [K in keyof T]: T[K] }

// Two assertions per row. A drift makes this file fail to compile and the
// error names the row that moved.

const _systemsKeys: SameKeys<SystemRow, typeof systems.$inferSelect> = true
const _systemsTypes: Narrows<SystemRow, typeof systems.$inferSelect> = true
const _accountsKeys: SameKeys<AccountRow, typeof accounts.$inferSelect> = true
const _accountsTypes: Narrows<AccountRow, typeof accounts.$inferSelect> = true
const _malwareKeys: SameKeys<MalwareRow, typeof malware.$inferSelect> = true
const _malwareTypes: Narrows<MalwareRow, typeof malware.$inferSelect> = true
const _networkKeys: SameKeys<NetworkIndicatorRow, typeof networkIndicators.$inferSelect> = true
const _networkTypes: Narrows<NetworkIndicatorRow, typeof networkIndicators.$inferSelect> = true
const _impactKeys: SameKeys<ImpactRow, typeof impact.$inferSelect> = true
const _impactTypes: Narrows<ImpactRow, typeof impact.$inferSelect> = true
const _cloudAppsKeys: SameKeys<CloudAppRow, typeof cloudApps.$inferSelect> = true
const _cloudAppsTypes: Narrows<CloudAppRow, typeof cloudApps.$inferSelect> = true
const _evidenceKeys: SameKeys<EvidenceRow, typeof evidence.$inferSelect> = true
const _evidenceTypes: Narrows<EvidenceRow, typeof evidence.$inferSelect> = true
const _actionsKeys: SameKeys<ActionRow, typeof actions.$inferSelect> = true
const _actionsTypes: Narrows<ActionRow, typeof actions.$inferSelect> = true
/**
 * **A note's row carries one column the wire deliberately does not.**
 */
type ServedNoteColumns = Omit<typeof caseNotes.$inferSelect, 'document'>
const _caseNotesKeys: SameKeys<CaseNoteRow, ServedNoteColumns> = true
const _caseNotesTypes: Narrows<CaseNoteRow, ServedNoteColumns> = true
/**
 * **The timeline's row schema against the type it is meant to describe.**
 */
const _timelineRowShape: Exact<Plain<TimelineRowShape>, Plain<TimelineRow>> = true

/**
 * The case row, which carries no `caseId` because it *is* the case - and none
 * of the compliance columns, which are their own row with their own version.
 */
const _casesKeys: SameKeys<CaseRow, typeof cases.$inferSelect> = true
const _casesTypes: Narrows<CaseRow, typeof cases.$inferSelect> = true
/**
 * **The timeline is asserted per arm, because the wire is a union.**
 */
type TimelineArmKeys = keyof Plain<TimelineEventRow> | keyof Plain<TimelineActionRow>

/**
 * **Fields the server derives, which are on the wire and in no column.**
 */
type Derived = 'ukcPhase' | 'ukcCycle'
const _timelineKeys: Exact<
  Exclude<TimelineArmKeys, Derived>,
  keyof Wire<typeof timeline.$inferSelect>
> = true

/** And the derived ones are genuinely absent from the table, not merely excluded. */
const _derivedAreNotColumns: Exact<
  Extract<keyof Wire<typeof timeline.$inferSelect>, Derived>,
  never
> = true
const _timelineEventTypes: ArmNarrows<TimelineEventRow, typeof timeline.$inferSelect> = true
const _timelineActionTypes: ArmNarrows<TimelineActionRow, typeof timeline.$inferSelect> = true

/**
 * **Three rows the wire declares and this file was never extended to hold.**
 */
const _methodsKeys: SameKeys<MethodRow, typeof methods.$inferSelect> = true
const _methodsTypes: Narrows<MethodRow, typeof methods.$inferSelect> = true
/**
 * **Three columns the wire deliberately does not carry**, for the reason
 * `caseNotes.document` is left out above: they are large and a listing is not
 * what they are for.
 */
type ServedReportColumns = Omit<
  typeof reports.$inferSelect,
  'document' | 'frozen' | 'frozenAt'
>
const _reportsKeys: SameKeys<ReportRow, ServedReportColumns> = true
const _reportsTypes: Narrows<ReportRow, ServedReportColumns> = true

/**
 * `hasProse` is derived per read and stored nowhere, so it is named here the
 * way the timeline's `ukcPhase` is rather than the check being loosened.
 */
type BlockDerived = 'hasProse'
const _reportBlocksKeys: Exact<
  Exclude<keyof Plain<ReportBlockRow>, BlockDerived>,
  keyof Wire<typeof reportBlocks.$inferSelect>
> = true
const _reportBlocksDerivedAreNotColumns: Exact<
  Extract<keyof Wire<typeof reportBlocks.$inferSelect>, BlockDerived>,
  never
> = true

describe('the wire contract', () => {
  /**
   * **A runtime test as well, because a type-only file can stop being checked.**
   */
  it('binds every collection row to its table', () => {
    expect([
      _systemsKeys,
      _systemsTypes,
      _accountsKeys,
      _accountsTypes,
      _malwareKeys,
      _malwareTypes,
      _networkKeys,
      _networkTypes,
      _impactKeys,
      _impactTypes,
      _cloudAppsKeys,
      _cloudAppsTypes,
      _evidenceKeys,
      _evidenceTypes,
      _actionsKeys,
      _actionsTypes,
      _caseNotesKeys,
      _caseNotesTypes,
      _timelineKeys,
      _timelineEventTypes,
      _timelineActionTypes,
      _methodsKeys,
      _methodsTypes,
      _reportsKeys,
      _reportsTypes,
      _reportBlocksKeys,
      _reportBlocksDerivedAreNotColumns,
    ]).toEqual(Array.from({ length: 27 }, () => true))
  })

  /**
   * **What stops this file being extended one table late.**
   */
  it('covers every collection the registry names', () => {
    const COVERED = [
      'systems',
      'accounts',
      'malware',
      'network_indicators',
      'impact',
      'cloud_apps',
      'evidence',
      'actions',
      'casenotes',
      'timeline',
      'methods',
      'reports',
      'report_blocks',
    ]
    expect(new Set(COVERED)).toEqual(new Set(Object.keys(REVIEWABLE)))
  })
})

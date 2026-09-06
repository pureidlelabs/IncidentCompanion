/**
 * That the wire contract still describes the tables it claims to.
 *
 * **The assertions are types, and they fail the typecheck rather than the
 * run.** `wire.ts` is hand-declared so the client can read it without a
 * database library; the cost of that choice is that nothing stops it drifting
 * from the columns it mirrors. This is what stops it. Adding a column and not
 * the field turns `npm run typecheck` red - in `server/`, where the column was
 * added, rather than in the client where it would surface as an absent value.
 *
 * **Two assertions per row, because the relationship is not equality.** The
 * keys match exactly - that is the drift that actually happens, a migration
 * adding a column while every existing type still satisfies a one-way
 * `extends`. The *values* are checked one way only: the row must be assignable
 * to the column shape, and is deliberately allowed to be narrower.
 *
 * **That narrowing is the vocabularies, and it is real.** `verdict` is
 * `text NOT NULL` in Postgres and `assetVerdictSchema` in the domain, so the
 * column holds any string and the row holds one of five. Asserting equality
 * would force the contract to say `string` and throw away the union the UI
 * switches on; asserting it the other way would claim Postgres enforces
 * something it does not. What makes the narrow type true is that every write
 * goes through Zod - so it is a property of the write path, not of storage,
 * and this is the honest way to state it.
 *
 * **The `Wire` mapping is the claim under test, not a convenience.** Drizzle
 * types a `timestamp` column as `Date`; the value the client receives has been
 * through `JSON.stringify` and is an ISO string. Anything asserting the row
 * against the raw Drizzle type would be asserting the shape nobody receives.
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
 * Mutual assignability. `[A] extends [B]` is wrapped in tuples so a union on
 * either side is compared whole rather than distributed member by member -
 * without it, `TimelineRow`'s event/action union satisfies the check by
 * matching one arm.
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
 * holder - so they are stripped before comparing. Without this every row fails
 * on `readonly id` alone.
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
 *
 * `document` is the CRDT update the prose socket owns, and the `note` column
 * beside it is the plain-text projection every reader actually uses. Putting
 * the binary on the wire would send a Yjs update inside every row of every
 * listing, so the key sets are compared with it taken out rather than the wire
 * type widened to admit it.
 */
type ServedNoteColumns = Omit<typeof caseNotes.$inferSelect, 'document'>
const _caseNotesKeys: SameKeys<CaseNoteRow, ServedNoteColumns> = true
const _caseNotesTypes: Narrows<CaseNoteRow, ServedNoteColumns> = true
/**
 * **The timeline's row schema against the type it is meant to describe.** The
 * type was composed by hand from the two write schemas plus an envelope; the
 * schema is what `@ZodResponse` publishes. Two descriptions of one response is
 * how the client got a flat timeline, so they are held to each other here
 * until the type is inferred from the schema outright.
 */
const _timelineRowShape: Exact<Plain<TimelineRowShape>, Plain<TimelineRow>> = true

/**
 * The case row, which carries no `caseId` because it *is* the case - and none
 * of the compliance columns, which are their own row with their own version.
 */
const _casesKeys: SameKeys<CaseRow, typeof cases.$inferSelect> = true
const _casesTypes: Narrows<CaseRow, typeof cases.$inferSelect> = true
/**
 * **The timeline is asserted per arm, because the wire is a union.** `keyof`
 * over a union yields only the keys its members share, so the whole-row check
 * used above passes while describing only what both arms carry - the one shape
 * where `SameKeys` is quietly weaker than it looks.
 *
 * Coverage is therefore asserted over both arms *together*: every column is an
 * event's, an action's, or the envelope's. A column added to the table with no
 * home in either arm has nowhere to hide.
 */
type TimelineArmKeys = keyof Plain<TimelineEventRow> | keyof Plain<TimelineActionRow>

/**
 * **Fields the server derives, which are on the wire and in no column.**
 *
 * Named rather than allowed for by loosening the check to "the table's columns
 * are a subset". A derived field is a decision - it is computed on every read
 * and can never be written - so adding one should require saying so here, and
 * a *stored* column that quietly went missing from the arms must still fail.
 *
 * `ukcPhase`/`ukcCycle` are a function of `tactic`, `technique` and
 * `ukcOverride`. -> `domain/killchain.ts`
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
 * **The three rows this file was widened last to cover.**
 *
 * `MethodRow`, `ReportRow` and `ReportBlockRow` are served like every row
 * above, so a column added to any of the three drifts in exactly the way this
 * file exists to prevent unless it is compared to its table here.
 */
const _methodsKeys: SameKeys<MethodRow, typeof methods.$inferSelect> = true
const _methodsTypes: Narrows<MethodRow, typeof methods.$inferSelect> = true
/**
 * **Three columns the wire deliberately does not carry**, for the reason
 * `caseNotes.document` is left out above: they are large and a listing is not
 * what they are for. `document` is the report-wide CRDT holding every written
 * block's prose, and `frozen` is the rendered node tree a sent report is
 * served from, with `frozenAt` beside it.
 *
 * Taken out of the comparison rather than admitted into the wire type, and
 * `SameKeys` is mutual -- so this passing says the difference is exactly these
 * three and no other column is hiding behind them.
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
   * **A runtime test as well, because a type-only file can stop being
   * checked.** `vitest` does not typecheck, so these assertions run under
   * `npm run typecheck` and nowhere else - a file that nothing imports and no
   * suite executes is one a future `tsconfig` `exclude` can drop in silence.
   * Referencing the constants gives the file a reason to be compiled that a
   * reader can see.
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
   *
   * The assertions above are types and cannot be enumerated at run time, so
   * until this case existed a table added to the application was simply
   * uncovered -- which is how `methods`, `reports` and `report_blocks` came to
   * be served with nothing comparing them to their columns.
   *
   * `COVERED` is written out rather than derived: naming a table here is the
   * act of saying somebody added its two assertions. Deriving it from the
   * registry would make the check pass by construction and assert nothing.
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

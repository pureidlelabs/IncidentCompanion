/**
 * The eight entity tables, in one file because they are one decision: every one
 * is rows belonging to a case, versioned, attributed and announced the same
 * way, and they differ only in columns.
 *
 * A default here must be a value its own vocabulary still offers, and the
 * pessimistic end of it.
 */
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { cases } from './case.js'
import { rowVersioning } from './columns.js'
import { caseScoped } from './scoped.js'

const owner = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
})

/** Which door the row came through. Distinct from the timeline's `provenance`. */
const source = () => text('source').notNull().default('manual')

export const systems = pgTable(
  'systems',
  {
    ...owner(),
    hostname: text('hostname').notNull().default(''),
    systemType: text('system_type').notNull().default(''),
    verdict: text('verdict').notNull().default('unknown'),
    analysisStatus: text('analysis_status').notNull().default('open'),
    analyst: text('analyst').notNull().default(''),
    source: source(),
    isolated: boolean('isolated').notNull().default(false),
    isolatedAt: timestamp('isolated_at', { withTimezone: true }),
    zone: text('zone').notNull().default('external'),
    methodId: uuid('method_id').references(() => methods.id, { onDelete: 'set null' }),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('systems_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

export const accounts = pgTable(
  'accounts',
  {
    ...owner(),
    accountName: text('account_name').notNull().default(''),
    domain: text('domain').notNull().default(''),
    privileges: text('privileges').notNull().default(''),
    lastActivity: text('last_activity').notNull().default(''),
    source: source(),
    disabled: boolean('disabled').notNull().default(false),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    methodId: uuid('method_id').references(() => methods.id, { onDelete: 'set null' }),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('accounts_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

export const malware = pgTable(
  'malware',
  {
    ...owner(),
    filename: text('filename').notNull().default(''),
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'set null' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    hash: text('hash').notNull().default(''),
    verdict: text('verdict').notNull().default('unknown'),
    family: text('family').notNull().default(''),
    signature: text('signature').notNull().default(''),
    // **A timestamp, not text.** Python stores every field as a string, so
    // `first_seen` was lifted as one -- and a `Date` written into a text column
    // lands as a local-timezone string (`+02:00`) that no reader parses back
    // the same way. `MALWARE_FIELDS` calls it an `event_datetime`, which is the
    // spec agreeing. `last_activity` stays text on the same evidence: its spec
    // kind is `text`, because it is copied out of a directory export.
    firstSeen: timestamp('first_seen', { withTimezone: true }),
    source: source(),
    methodId: uuid('method_id').references(() => methods.id, { onDelete: 'set null' }),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('malware_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

export const networkIndicators = pgTable(
  'network_indicators',
  {
    ...owner(),
    type: text('type').notNull().default('domain'),
    value: text('value').notNull().default(''),
    scope: text('scope').notNull().default(''),
    port: text('port').notNull().default(''),
    /**
     * **A real foreign key, which the Python model could not have.** There a
     * reference was a string in a JSON document, so nothing stopped an
     * indicator naming a host that had been deleted - the app carried code to
     * tolerate ids that no longer resolve.
     *
     * `set null`: deleting the host does not delete the indicator. The
     * indicator is still an indicator; what it loses is the link.
     */
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'set null' }),
    /** The sample this is command-and-control for. One sample, many addresses. */
    malwareId: uuid('malware_id').references(() => malware.id, { onDelete: 'set null' }),
    context: text('context').notNull().default(''),
    /** What it is. See `vocabularies.DISPOSITION`. */
    disposition: text('disposition').notNull().default('unknown'),
    /** How far anyone got with it, as against `disposition` above, which is what it is. */
    triage: text('triage').notNull().default('untriaged'),
    source: source(),
    blocked: boolean('blocked').notNull().default(false),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    methodId: uuid('method_id').references(() => methods.id, { onDelete: 'set null' }),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('network_indicators_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

/**
 * What data the incident touched, and what happened to it - the disposition is
 * a column, so encrypted in place, destroyed, altered and merely accessed all
 * have a row. -> `domain/entities/impact.ts`
 *
 * Where the data *lived* is here; how it moved is a route with a time on it,
 * and belongs in the timeline.
 */
export const impact = pgTable(
  'impact',
  {
    ...owner(),
    label: text('label').notNull().default(''),
    category: text('category').notNull().default(''),
    /** See `vocabularies.DATA_DISPOSITION`. Never blank: `unknown` is a real answer. */
    disposition: text('disposition').notNull().default('unknown'),

    /**
     * **Nullable, and that is the difference between "none" and "not counted
     * yet".** Art 33(3)(a) asks for an approximate figure inside 72 hours; a
     * zero default would answer it with a number nobody established.
     */
    subjectCount: integer('subject_count'),
    recordCount: integer('record_count'),
    /**
     * **`bigint` because 4GB fits in a mailbox export.** `integer` tops out at
     * 2.1e9, which is under three gigabytes - reachable by an ordinary
     * archive, and the overflow is a write error rather than a wrong number.
     * Read as a JS number: `Number.MAX_SAFE_INTEGER` is 9PB.
     */
    volumeBytes: bigint('volume_bytes', { mode: 'number' }),

    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'set null' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /**
     * **A jsonb array, so Postgres does not constrain it** - the same shape and
     * the same cost as the timeline's many-sided references, and why
     * `bulk-delete.service.ts` counts array references by hand.
     */
    evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull().default([]),
    /** Which recorded acts established this impact. */
    methodIds: jsonb('method_ids').$type<string[]>().notNull().default([]),

    notes: text('notes').notNull().default(''),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('impact_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

/**
 * OAuth app registrations. **Its own table rather than folded into systems or
 * accounts**: publisher, requested scopes, consent type and verified-publisher
 * status map onto neither a device nor an identity, and consent phishing is
 * one of the most common cloud-native patterns a device-centric schema has no
 * field for at all.
 */
export const cloudApps = pgTable(
  'cloud_apps',
  {
    ...owner(),
    appName: text('app_name').notNull().default(''),
    instance: text('instance').notNull().default(''),
    publisher: text('publisher').notNull().default(''),
    requestedScopes: text('requested_scopes').notNull().default(''),
    consentType: text('consent_type').notNull().default('admin'),
    verifiedPublisher: text('verified_publisher').notNull().default('unverified'),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    source: source(),
    methodId: uuid('method_id').references(() => methods.id, { onDelete: 'set null' }),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('cloud_apps_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

export const evidence = pgTable(
  'evidence',
  {
    ...owner(),
    type: text('type').notNull().default(''),
    name: text('name').notNull().default(''),
    location: text('location').notNull().default(''),
    /**
     * **Computed, never accepted from a caller.** A hash taken on a caller's
     * word is a claim about nothing - the verification that checks the file
     * against it becomes circular.
     */
    hash: text('hash').notNull().default(''),
    dataClassification: text('data_classification').notNull().default(''),

    /**
     * The artefact's own custody, not the row's.
     *
     * `createdBy`/`createdAt` say who recorded this and when; these say who
     * acquired the thing and when - routinely a different person on a different
     * day, and putting the recorder's name on a chain of custody is wrong in a
     * way nobody notices until it is quoted.
     */
    collectedBy: text('collected_by').notNull().default(''),
    collectedAt: timestamp('collected_at', { withTimezone: true }),
    acquisitionTool: text('acquisition_tool').notNull().default(''),

    /** Which function produced `hash`. A bare digest cannot be checked. */
    hashAlgorithm: text('hash_algorithm'),

    /**
     * Set when the bytes are held by this app, at `evidence/<hash>`.
     *
     * **Null is the ordinary case.** Most evidence lives in an evidence locker
     * and this row records that it exists and where - `location`. Only small
     * artefacts are attached.
     */
    storedAt: timestamp('stored_at', { withTimezone: true }),
    sizeBytes: integer('size_bytes'),
    contentType: text('content_type'),
    originalFilename: text('original_filename').notNull().default(''),
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'set null' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    methodId: uuid('method_id').references(() => methods.id, { onDelete: 'set null' }),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('evidence_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

/**
 * How a finding was obtained - Evidence's sibling, for acts rather than
 * artefacts.
 *
 * **One row per act, referenced n times.** A single proxy-log query in the
 * campaign demo establishes three timeline entries, two systems, one network
 * indicator, one evidence record and a compliance gate; storing the query on
 * each of those is a copy per referent that can silently disagree, and the
 * claim a peer reviewer checks is that they were one act.
 *
 * **`query` and `result_excerpt` are `text` with no ceiling in the column.**
 * The schema caps both; a saved console export is bytes and belongs in the
 * evidence store, which this row points at.
 */
export const methods = pgTable(
  'methods',
  {
    ...owner(),
    name: text('name').notNull().default(''),
    kind: text('kind').notNull().default(''),
    established: text('established').notNull().default(''),
    console: text('console').notNull().default(''),
    workspace: text('workspace').notNull().default(''),
    runBy: text('run_by').notNull().default(''),
    runAt: timestamp('run_at', { withTimezone: true }),
    grammar: text('grammar').notNull().default(''),
    /** Verbatim, and the one field that reaches a document undefanged. */
    query: text('query').notNull().default(''),
    /**
     * The absolute window, stated rather than parsed out of `query`.
     * Null on either half is *not stated*, which the screen draws as a gap.
     */
    windowFrom: timestamp('window_from', { withTimezone: true }),
    windowTo: timestamp('window_to', { withTimezone: true }),
    /** **Nullable on purpose**: `0` rows is an answer, unset is not. */
    rowsReturned: integer('rows_returned'),
    resultColumns: text('result_columns').notNull().default(''),
    resultExcerpt: text('result_excerpt').notNull().default(''),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('methods_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

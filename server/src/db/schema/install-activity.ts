/**
 * What was done to this installation, and who signed in to do it.
 *
 * The install's counterpart to `change_feed`, which is per case and cascades
 * with it. Nothing here is derivable after the fact: a role that went up and
 * came back down leaves `user.role` exactly as it was, and a sign-in leaves a
 * `session` row that is deleted when it expires.
 *
 * **Append-only in the database, not by convention** - `ic_app` may insert and
 * select, has no update policy at all, and may delete only what is past the
 * install's declared retention window. So a line cannot be edited, and cannot
 * be removed early, through the role the server runs as. See `appendOnly`
 * below for what that does and does not defend.
 */
import {
  bigserial,
  integer,
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { user } from './auth.js'

/**
 * What happened. One value per thing this install can have done to it.
 *
 * **The test is whether the event survives its own subject**, not whether the
 * route is admin-gated. That is what puts `case_deleted` here: `change_feed`
 * cascades with the case, so the per-case log is destroyed by the one event it
 * would most need to record. `case_created` follows it, or the log says cases
 * vanish and never appear.
 *
 * Adding a value is a schema change on purpose: an audit whose vocabulary is
 * free text cannot be filtered, and a writer that invents its own spelling is
 * invisible to every reader.
 *
 * **Four of these are here because a standard asks for them and this app's own
 * routes would not have suggested them** - the vocabulary was drawn from the
 * admin-gated routes first, which is how an audit ends up recording only what
 * succeeded:
 *
 * - `sign_in_failed` and `access_denied` - both standards want *rejected*
 *   attempts as well as accepted ones. Without the second, an analyst probing
 *   the admin routes leaves no trace at all: `@AdminOnly()` refuses them and
 *   nothing writes anything down.
 * - `signed_out` - ISO names log-on *and* log-off, and a session whose end is
 *   never recorded cannot answer how long access was held.
 * - `install_started` - operational actions. It also bounds a gap: a quiet
 *   period with a start at the end of it is a restart, and one without is a
 *   question.
 *
 */
export const installEvent = pgEnum('install_event', [
  'install_started',
  'signed_in',
  'signed_out',
  'sign_in_failed',
  'access_denied',
  // **Reading the audit is itself an audited act.** OWASP: "all access to the
  // logs must be recorded". Rate-limited to one line per reader per hour by
  // `InstallActivityReadService`, or a collector polling every five minutes
  // buries what the log is for under the fact that somebody looked.
  'audit_read',
  // **The boundary's own event.** Every mutating request that no typed method
  // named records one of these, so a route added tomorrow is audited whether
  // or not anybody remembered - which is the whole point of moving auditing
  // off the call site.
  'api_called',
  // A read worth recording by name: evidence leaving the app, and an export.
  'evidence_read',
  'data_exported',
  // **The socket's own two.** An upgrade inherits no interceptor, so this is
  // the one write path the boundary cannot see - and it persists the report,
  // which is the deliverable of the whole app.
  'case_opened_live',
  'live_refused',
  // **Shortening retention is the cheapest way to destroy evidence**, so the
  // change is itself an event - and one of the loudest, because it is the only
  // act in this vocabulary whose effect is on the log rather than in it.
  'audit_retention_changed',
  // **The second act whose effect is on the log rather than in it**, and the
  // only one that removes lines at all. Where the install is the record --
  // which is what an install with no destination configured is -- the prune
  // takes the only copy, so an unrecorded prune makes a gap in the audit
  // indistinguishable from a period when nothing happened.
  'audit_pruned',
  'setting_changed',
  'account_created',
  'account_disabled',
  'account_enabled',
  'account_locked',
  'rate_limited',
  'account_role_changed',
  'account_password_reset',
  // The customer directory: which organisations the install holds is a
  // management-plane fact, and a merge moves every case at once.
  'customer_created',
  'customer_changed',
  'customer_removed',
  'customers_merged',
  // Reach, which is a privilege rather than an account fact: who was given
  // what over whose cases is the question an auditor opens this log with.
  // A group has to be made before anybody can be put in one.
  'group_created',
  'reach_granted',
  'reach_revoked',
  'group_held_customer',
  'group_released_customer',
  'case_created',
  'case_deleted',
  // **Who a case is for is a reach decision, not an edit.** Moving a case
  // between customers moves who can reach it, so the line names both records
  // and belongs beside the grants rather than in the case's own feed -- which
  // the analyst who just lost the case cannot read.
  'case_attributed',
  // `PUT /api/library/{slug}` replaces a whole kind and can turn a shipped
  // built-in off install-wide, which no per-entry route can do. It is a
  // configuration change rather than an edit.
  'library_kind_replaced',
  'regime_switched',
  'report_language_uploaded',
  'report_language_removed',
])

/**
 * Which log a line belongs to, so a reader or a collector can take a subset.
 *
 * **A stored column rather than a derived filter**, because the thing that
 * consumes this takes one stream at a time: Sentinel's codeless framework maps
 * one connection to one endpoint to one table, and a reader tab wants an index
 * rather than an `IN` list of fifteen events that has to be edited whenever a
 * sixteenth arrives.
 *
 * **The risk of storing a derived value is drift**, so there is exactly one
 * map - `CHANNEL_OF` - and a test that fails on an event with no entry. Never
 * stamp this column from a call site.
 *
 * The four are 800-92's own categories, which is where the divisions come from
 * rather than from taste: account information, significant operational
 * actions, and the two this app adds because it has them.
 */
export const installChannel = pgEnum('install_channel', [
  /** Who got in, who did not, and who was turned away. */
  'authentication',
  /** Accounts, roles, and the installation's own settings. */
  'administration',
  /** A case appearing or disappearing. Not what happened *inside* one. */
  'case',
  /**
   * The install's own running: start-ups, the requests no typed event named,
   * and the acts that are about the log rather than in it.
   */
  'operations',
])

export type InstallChannel = (typeof installChannel.enumValues)[number]

/**
 * The one place an event's channel is decided.
 *
 * **Exhaustive by type**, so adding an event to `installEvent` without a
 * channel is a compile error rather than a row that lands in whichever stream
 * sorts first.
 */
export const CHANNEL_OF: Record<(typeof installEvent.enumValues)[number], InstallChannel> = {
  install_started: 'operations',
  signed_in: 'authentication',
  signed_out: 'authentication',
  sign_in_failed: 'authentication',
  access_denied: 'authentication',
  audit_read: 'operations',
  api_called: 'operations',
  evidence_read: 'case',
  data_exported: 'case',
  case_opened_live: 'case',
  live_refused: 'authentication',
  audit_retention_changed: 'operations',
  // Beside the retention change it enacts, so the setting and its effect are
  // read in one stream.
  audit_pruned: 'operations',
  // **Administration, because somebody decided it.** The retention change
  // predates this and stays in operations; a new one would not be filed
  // there, and moving it would rewrite what old lines mean.
  setting_changed: 'administration',
  account_created: 'administration',
  account_disabled: 'administration',
  account_enabled: 'administration',
  // **Authentication, not administration.** Nobody administered anything:
  // it is the sign-in path refusing, and it is read beside the failures
  // that caused it.
  account_locked: 'authentication',
  // **Operations, not authentication.** Most refusals are not sign-ins:
  // the tier is in the line, and reading them beside the sign-in failures
  // would drown those in importer bursts.
  rate_limited: 'operations',
  account_role_changed: 'administration',
  account_password_reset: 'administration',
  customer_created: 'administration',
  customer_changed: 'administration',
  customer_removed: 'administration',
  customers_merged: 'administration',
  group_created: 'administration',
  reach_granted: 'administration',
  reach_revoked: 'administration',
  group_held_customer: 'administration',
  group_released_customer: 'administration',
  case_created: 'case',
  case_deleted: 'case',
  // **`administration`, with the grants, not `case`.** This channel is *a case
  // appearing or disappearing*, and an attribution is neither -- it changes who
  // reaches one, which is what `group_held_customer` beside it records. The
  // column is what a collector binds one stream to, so filing it here is what
  // puts it in front of the auditor watching reach.
  case_attributed: 'administration',
  library_kind_replaced: 'administration',
  regime_switched: 'administration',
  report_language_uploaded: 'administration',
  report_language_removed: 'administration',
}

/**
 * How long a line is kept, as the transaction that prunes declares it.
 *
 * **The same mechanism `caseScoped` uses**, and unset is the safe answer here
 * too: `current_setting(..., true)` is NULL when nothing set it, and every
 * comparison against NULL is NULL, so a delete outside a pruning transaction
 * matches no rows at all.
 */
const retention = sql`nullif(current_setting('app.audit_retention', true), '')::interval`
const operationalRetention = sql`nullif(current_setting('app.operational_retention', true), '')::interval`

/**
 * Insert and read always; delete only what is older than the declared window.
 *
 * **The window is enforced by the database rather than by the pruner**, which
 * is the whole point of doing it here. A pruner with an unbounded DELETE is
 * one bad interval away from erasing the evidence of whatever it is meant to
 * be retaining - and the shape of that mistake is a variable that reads `0
 * days` instead of `365 days`. Under this policy that statement matches
 * nothing, because `at < now() - '0 days'` is not satisfied by a row written
 * a moment ago... and it *is* satisfied by every older row, which is why the
 * floor is not the policy's job alone.
 *
 * **So the floor is a `CHECK`-shaped clause inside the policy**: the interval
 * must exceed a minimum before any row qualifies. `RETENTION_FLOOR_DAYS` states it
 * once, and `InstallActivityPruneService` refuses to set a shorter one - two
 * checks because the setting is reachable from anywhere the app can open a
 * transaction, and only one of them is in the database.
 *
 * **What this defends against is a defect, not an adversary.** A bug, a stray
 * `DELETE`, a future route that "tidies" old rows. It does not defend against
 * anyone holding `ic_migrate` or the superuser, who can drop the policy; an
 * audit that cannot be removed by its own owner is not something Postgres
 * offers. `TRUNCATE` is a table privilege that row-level security never sees,
 * and its absence from `docker/db/roles.sql` is load-bearing.
 *
 * `ic_seed` gets no delete policy at all, which is what stops a demo rebuild
 * taking the audit with the cases it is replacing.
 */
export const RETENTION_FLOOR_DAYS = 30

/**
 * The floor for the operational window, which is lower and deliberately so.
 *
 * **Seven days, because these lines answer a question about this week.** An
 * install debugging an importer wants them; nobody asks in March what the
 * socket did in January. The floor is not zero for the same reason the audit's
 * is not: a window of nothing is a pruner that erases as fast as the app
 * writes, and the first thing lost is the context around an incident that has
 * not been noticed yet.
 */
export const OPERATIONAL_FLOOR_DAYS = 7

function appendOnly() {
  return [
    pgPolicy('install_activity_reads', { for: 'select', using: sql`true` }),
    /**
     * **An append may not choose its own clock.** `withCheck: true` would let
     * any writer set `at` to any value, so a compromised write path could file
     * a line last year - where nobody reading the recent log would ever see it
     * - or in the future, where it sits above every real event for ever. The
     * column defaults to `now()` and every legitimate writer takes that
     * default, so the window costs nothing and closes both.
     *
     * A minute either side rather than an exact match, because `now()` is the
     * transaction's start and a slow insert is not a forgery.
     */
    pgPolicy('install_activity_appends', {
      for: 'insert',
      withCheck: sql`at between now() - interval '1 minute' and now() + interval '1 minute'`,
    }),
    /**
     * **One policy, two windows, chosen by the line's own class.** The floor
     * is checked against whichever window applies, so setting the operational
     * one short cannot reach an `audit` row - the two settings are separate
     * permissions in the same transaction, and a pruner that set the wrong one
     * matches nothing rather than deleting the wrong thing.
     */
    pgPolicy('install_activity_prunes_the_expired', {
      for: 'delete',
      using: sql`
        case retention_class
          when 'operational' then
            ${operationalRetention} >= make_interval(days => ${sql.raw(String(OPERATIONAL_FLOOR_DAYS))})
            and at < now() - ${operationalRetention}
          else
            ${retention} >= make_interval(days => ${sql.raw(String(RETENTION_FLOOR_DAYS))})
            and at < now() - ${retention}
        end
      `,
    }),
  ]
}

export const installRetentionClass = pgEnum('install_retention_class', [
  'audit',
  'operational',
])

export const installActivity = pgTable(
  'install_activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The order rows are read in, and the cursor a collector pages by.
     *
     * **`at` cannot do this job.** Two rows written in the same millisecond
     * have no defined order, so a collector paging on a timestamp either
     * repeats a row or skips one at every page boundary - and an audit that
     * silently drops a line at a boundary is worse than one that is late.
     *
     * Unlike `change_feed.seq`, this **is** a resume cursor: a SIEM's whole
     * job is "give me everything after N", and unlike a case, an audit is
     * never refetched whole.
     */
    seq: bigserial('seq', { mode: 'bigint' }).notNull().unique(),

    event: installEvent('event').notNull(),

    /**
     * Which log this line belongs to. Stamped from `CHANNEL_OF` by the writer
     * and never by a caller. -> `installChannel`
     */
    channel: installChannel('channel').notNull(),

    /**
     * Which window prunes this line.
     *
     * **Stamped at write time like the channel and the OCSF ids**, rather than
     * derived by the pruner. A DELETE that recomputed the class would be a
     * second implementation of it, and the one that decides what is destroyed
     * is the worst place for the two to disagree.
     */
    retentionClass: installRetentionClass('retention_class').notNull().default('audit'),

    /**
     * The OCSF identity of this record, stored rather than derived on read.
     *
     * **A record should *be* the standard record, not be translated into one
     * on the way out.** Deriving at read time meant an exporter, a second
     * reader and any replay each had to re-derive it and could disagree; and
     * it made the classification a property of the *reader* rather than of the
     * event, which is exactly backwards.
     *
     * `typeUid` is `classUid * 100 + activityId` and is stored anyway: it is
     * the value a collector filters on, and computing it in three places is
     * how two of them drift.
     *
     * -> `install-activity/ocsf.ts`, verified against schema.ocsf.io
     */
    classUid: integer('class_uid').notNull(),
    activityId: integer('activity_id').notNull(),
    typeUid: integer('type_uid').notNull(),
    /** OCSF `severity_id`, 1 Informational .. 6 Fatal. */
    severityId: integer('severity_id').notNull(),
    /** OCSF `status_id`: 1 Success, 2 Failure. */
    statusId: integer('status_id').notNull(),

    /**
     * Who did it. Null when the account is gone, or when nobody was signed in
     * - a failed sign-in has no actor by definition.
     */
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),

    /**
     * What the actor was called at the time, copied rather than joined.
     *
     * **The join is what an audit cannot rely on.** `actorId` goes null when
     * the account is deleted, and a row reading "role changed by (nobody)" is
     * the one case the log exists for. The name is also what it was *then*:
     * an analyst who renamed themselves has not retroactively signed in under
     * the new name.
     */
    actorLabel: text('actor_label'),

    /**
     * What it was done to, in the same copied form: an account's username, a
     * regime's code, a language tag. Null for an event with no target, such
     * as a sign-in.
     */
    targetLabel: text('target_label'),

    /**
     * The one or two values that make the line readable - the role before and
     * after, the regime's new state. **Never a secret and never a password**,
     * hashed or otherwise: this column is read by every admin and survives the
     * account it describes.
     */
    detail: jsonb('detail').$type<Record<string, string>>().notNull().default({}),

    /**
     * Where the request came from, as the session table records it. Null when
     * the event had no request behind it.
     */
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The reader's order: newest first, optionally narrowed to one log or one
    // event kind.
    index('install_activity_at_idx').on(table.at.desc()),
    index('install_activity_event_at_idx').on(table.event, table.at.desc()),
    index('install_activity_channel_at_idx').on(table.channel, table.at.desc()),
    // A collector's order, which is the opposite one: everything after a
    // cursor, ascending, within one log.
    index('install_activity_channel_seq_idx').on(table.channel, table.seq),
    ...appendOnly(),
  ],
)

export type InstallActivityRow = typeof installActivity.$inferSelect

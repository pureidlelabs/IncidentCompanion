/**
 * What was done to this installation, and who signed in to do it.
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
  // configuration change rather than an edit, and the coverage gate is what
  // surfaced it: the route was admin-gated and recorded nothing.
  'library_kind_replaced',
  'regime_switched',
  'report_language_uploaded',
  'report_language_removed',
])

/**
 * Which log a line belongs to, so a reader or a collector can take a subset.
 */
export const installChannel = pgEnum('install_channel', [
  /** Who got in, who did not, and who was turned away. */
  'authentication',
  /** Accounts, roles, and the installation's own settings. */
  'administration',
  /** A case appearing or disappearing. Not what happened *inside* one. */
  'case',
  /** Start-ups, shut-downs, failures. */
  'operations',
])

export type InstallChannel = (typeof installChannel.enumValues)[number]

/**
 * The one place an event's channel is decided.
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
 */
const retention = sql`nullif(current_setting('app.audit_retention', true), '')::interval`
const operationalRetention = sql`nullif(current_setting('app.operational_retention', true), '')::interval`

/**
 * Insert and read always; delete only what is older than the declared window.
 */
export const RETENTION_FLOOR_DAYS = 30

/**
 * The floor for the operational window, which is lower and deliberately so.
 */
export const OPERATIONAL_FLOOR_DAYS = 7

function appendOnly() {
  return [
    pgPolicy('install_activity_reads', { for: 'select', using: sql`true` }),
    /**
     * **An append may not choose its own clock.**
     */
    pgPolicy('install_activity_appends', {
      for: 'insert',
      withCheck: sql`at between now() - interval '1 minute' and now() + interval '1 minute'`,
    }),
    /**
     * **One policy, two windows, chosen by the line's own class.**
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

/**
 * The two windows a line can fall under. -> `install-activity/retention-class.ts`
 */
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
     */
    retentionClass: installRetentionClass('retention_class').notNull().default('audit'),

    /**
     * The OCSF identity of this record, stored rather than derived on read.
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
     */
    actorLabel: text('actor_label'),

    /**
     * What it was done to, in the same copied form: an account's username, a
     * regime's code, a language tag.
     */
    targetLabel: text('target_label'),

    /**
     * The one or two values that make the line readable - the role before and
     * after, the regime's new state.
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

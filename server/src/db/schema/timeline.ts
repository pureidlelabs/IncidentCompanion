/**
 * The timeline table.
 */
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { cases } from './case.js'
import { systems } from './entities.js'
import { rowVersioning } from './columns.js'
import { caseScoped } from './scoped.js'

export const entryKind = pgEnum('entry_kind', ['event', 'action'])

/**
 * How the entry got here.
 */
export const entryProvenance = pgEnum('entry_provenance', ['typed', 'imported', 'note'])

export const timeline = pgTable(
  'timeline',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),

    kind: entryKind('kind').notNull(),

    /** The incident's clock. Distinct from `createdAt`, which is the row's. */
    time: timestamp('time', { withTimezone: true }).notNull(),
    description: text('description').notNull(),
    notes: text('notes').notNull().default(''),
    author: text('author').notNull().default(''),
    tags: text('tags').notNull().default(''),
    colour: text('colour').notNull().default(''),
    followup: boolean('followup').notNull().default(false),

    // --- event only ---------------------------------------------------------
    eventSource: text('event_source'),
    sourceTool: text('source_tool').notNull().default(''),
    tactic: text('tactic').notNull().default(''),
    technique: text('technique').notNull().default(''),
    ukcOverride: text('ukc_override').notNull().default(''),
    severity: text('severity'),
    /** Unset is a real state: an imported entry asserts no confidence. */
    confidence: text('confidence'),
    hideFromGraph: boolean('hide_from_graph').notNull().default(false),
    sourceSystemId: uuid('source_system_id').references(() => systems.id, { onDelete: 'set null' }),

    // --- action only --------------------------------------------------------
    actionType: text('action_type').notNull().default(''),

    // --- references ---------------------------------------------------------
    // **Single ids are foreign keys; many are `jsonb`, and only the first is
    // enforced.** A join table per pair would enforce both - seven of them for
    // one entry - and nothing here queries *backwards* from an account to the
    // entries naming it, so the cost buys referential integrity alone. That is
    // a real gap: a deleted account still appears in an entry's `accountIds`,
    // exactly as it did in Python. The scalar side no longer can.
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'set null' }),
    accountIds: jsonb('account_ids').$type<string[]>().notNull().default([]),
    cloudAppIds: jsonb('cloud_app_ids').$type<string[]>().notNull().default([]),
    networkIndicatorIds: jsonb('network_indicator_ids').$type<string[]>().notNull().default([]),
    malwareIds: jsonb('malware_ids').$type<string[]>().notNull().default([]),
    evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull().default([]),
    /** Which recorded acts established this entry. */
    methodIds: jsonb('method_ids').$type<string[]>().notNull().default([]),

    // --- server-owned -------------------------------------------------------
    provenance: entryProvenance('provenance').notNull().default('typed'),
    /** Import-only, and a state that clears where provenance never does. */
    unreviewed: boolean('unreviewed').notNull().default(false),
    /** This entry's time is where capture happened, not where the event did. */
    timeAssumed: boolean('time_assumed').notNull().default(false),

    ...rowVersioning,
  },
  (table) => [
    // The timeline's only order, and the only query the section makes.
    index('timeline_case_time_idx').on(table.caseId, table.time),
    ...caseScoped(table.caseId),
  ],
)

export type TimelineRow = typeof timeline.$inferSelect

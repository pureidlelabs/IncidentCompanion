/**
 * Reports and their blocks.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uuid, customType } from 'drizzle-orm/pg-core'

import { cases } from './case.js'
import { evidence } from './entities.js'
import { rowVersioning } from './columns.js'
import { caseScoped } from './scoped.js'

/** Postgres `bytea`. Drizzle 1.0 has no first-class bytea for node-postgres. */
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType: () => 'bytea',
})

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),

    label: text('label').notNull().default(''),
    template: text('template').notNull().default(''),

    /** Null for a report that is not a regulatory filing, which is most. */
    stage: text('stage'),
    tlp: text('tlp'),

    language: text('language').notNull().default(''),
    style: text('style').notNull().default(''),
    status: text('status').notNull().default('draft'),

    sentAt: timestamp('sent_at', { withTimezone: true }),

    /**
     * The collaborative document holding every written block's prose.
     */
    document: bytea('document'),

    /**
     * The rendered node tree, once frozen. Null while it is a draft.
     */
    frozen: jsonb('frozen'),
    frozenAt: timestamp('frozen_at', { withTimezone: true }),

    ...rowVersioning,
  },
  (t) => [index('reports_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

export const reportBlocks = pgTable(
  'report_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),

    /** Draw order. Gaps are fine and survive a reorder. */
    position: integer('position').notNull().default(0),
    kind: text('kind').notNull().default('written'),

    /** What the analyst typed; `headingKey` is what the language pack supplies. */
    heading: text('heading').notNull().default(''),
    headingKey: text('heading_key').notNull().default(''),

    /**
     * Which evidence image a `figure` block draws - one column, rather than a
     * general body column that would invite the prose back out of the CRDT.
     */
    evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'set null' }),

    ...rowVersioning,
  },
  (t) => [
    index('report_blocks_report_idx').on(t.reportId, t.position),
    ...caseScoped(t.caseId),
  ],
)

/**
 * Reports and their blocks. The written prose is one Yjs document per report
 * with a field per block, so a block row says what the section *is* and where
 * it sits, never what it says.
 *
 * `document` is bytea because it holds Yjs' binary encoding, history included.
 * A frozen report keeps its rendered tree: it is the compliance artefact, so
 * re-rendering must not be able to produce something else.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uuid, customType } from 'drizzle-orm/pg-core'

import { cases } from './case.js'
import { evidence } from './entities.js'
import { rowVersioning } from './columns.js'
import { caseScoped } from './scoped.js'

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
     *
     * **One per report rather than one per block**, so the whole report has a
     * single restore point and report-wide presence is expressible at all.
     */
    document: bytea('document'),

    /**
     * The rendered node tree, once frozen. Null while it is a draft.
     *
     * **Not markdown.** Re-parsing markdown to render is a round trip that can
     * lose a table, and a regulator receiving a different document from the one
     * approved is the failure this shape exists to prevent.
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
     *
     * `set null` on delete, so a deleted artefact leaves a block the resolver
     * can still state something true about.
     */
    evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'set null' }),

    ...rowVersioning,
  },
  (t) => [
    index('report_blocks_report_idx').on(t.reportId, t.position),
    ...caseScoped(t.caseId),
  ],
)

/**
 * The two tables that are not evidence about the intrusion: actions are the
 * investigation's own task list rather than containment, and case notes are
 * the scratchpad, deliberately outside the report.
 */
import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { cases } from './case.js'
import { bytea, rowVersioning } from './columns.js'
import { caseScoped } from './scoped.js'

const owner = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
})

export const actions = pgTable(
  'actions',
  {
    ...owner(),
    task: text('task').notNull().default(''),
    taskType: text('task_type').notNull().default(''),
    /**
     * **A literal, not the vocabulary's first element.** Python pins the same
     * thing on purpose: indexing the list makes
     * "the default is a value the dropdown offers" true by construction, so
     * the test asserting it can never fail. Spelled out, the two are checkable
     * against each other.
     */
    status: text('status').notNull().default('open'),
    assignee: text('assignee').notNull().default(''),
    /** Free text, as in Python: analysts write "end of week" as often as a date. */
    dateDue: text('date_due').notNull().default(''),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('actions_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

export const caseNotes = pgTable(
  'casenotes',
  {
    ...owner(),
    /**
     * The note's words as plain text, **derived from `document` and not
     * written by an analyst**.
     *
     * A report block has no column like this because a section is found by its
     * heading; a note has no heading, so its index row, the search index and
     * the CSV export are all the opening line of its body. The document is the
     * record and this is the projection `ProseService.flush` re-derives from
     * it.
     */
    note: text('note').notNull().default(''),
    /**
     * The note's prose, as one Yjs document with a single `note` fragment.
     *
     * One per note rather than one per case: a note is created, read and
     * deleted on its own, so a case-wide document would leave a fragment
     * behind every time one went.
     */
    document: bytea('document'),
    author: text('author').notNull().default(''),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('casenotes_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

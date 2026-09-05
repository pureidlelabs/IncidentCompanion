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
     * **A literal, not the vocabulary's first element.**
     */
    status: text('status').notNull().default('open'),
    /** Who owes the work. The one field here about the future, not the past. */
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
     */
    note: text('note').notNull().default(''),
    /**
     * The note's prose, as one Yjs document with a single `note` fragment.
     */
    document: bytea('document'),
    author: text('author').notNull().default(''),
    tags: text('tags').notNull().default(''),
    ...rowVersioning,
  },
  (t) => [index('casenotes_case_idx').on(t.caseId), ...caseScoped(t.caseId)],
)

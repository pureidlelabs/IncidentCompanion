/**
 * Which cases an analyst has open in their head, and which they pinned there.
 */
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { user } from './auth.js'
import { cases } from './case.js'

export const caseVisits = pgTable(
  'case_visits',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),

    /**
     * The rail section they were in, free text: the section list is the client's,
     * and an installed plugin extends it.
     */
    section: text('section'),

    visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * **When it was pinned, not whether.**
     */
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.caseId] }),
    // The read is always one analyst's newest first, and the prune deletes the
    // tail of that same order.
    index('case_visits_recent_idx').on(t.userId, t.visitedAt.desc()),
  ],
)

export type CaseVisitRow = typeof caseVisits.$inferSelect

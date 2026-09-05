/**
 * A refused save, kept until the analyst answers it - the only copy of the
 * rejected edit once the response has been sent.
 */
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { cases } from './case.js'
import { user } from './auth.js'
import { caseScoped } from './scoped.js'

export const conflicts = pgTable(
  'conflicts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Dies with the case: a review of a row in a deleted case has no question left to ask. */
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),

    /**
     * Whose refused save this is. **Cascades**: the review is unanswerable by
     * anyone else, since only its author knows what they meant.
     */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    /** The collection name as the URL spells it, and the row inside it. */
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),

    /**
     * What to call the row on screen - a hostname, a description.
     */
    label: text('label').notNull().default(''),

    /**
     * The values the edit was made against, and the values it tried to write.
     */
    base: jsonb('base').notNull().$type<Record<string, unknown>>(),
    mine: jsonb('mine').notNull().$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('conflicts_case_user_idx').on(t.caseId, t.userId),
    unique('conflicts_one_per_row_per_analyst').on(t.caseId, t.userId, t.entity, t.entityId),
    ...caseScoped(t.caseId),
  ],
)

export type ConflictRow = typeof conflicts.$inferSelect

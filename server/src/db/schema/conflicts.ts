/**
 * A refused save, kept until the analyst answers it - the only copy of the
 * rejected edit once the response has been sent.
 *
 * Keyed by analyst rather than by browser session, so a review survives a
 * reload, a new tab and a re-sign-in. One pending review per row per analyst:
 * a second refusal replaces `mine`.
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
     * **Never the id**: an analyst asked to choose between two versions of
     * `a3f8b2...` is being asked about a string they have never seen. Captured at
     * refusal time because the row may be gone by the time the review is read.
     */
    label: text('label').notNull().default(''),

    /**
     * The values the edit was made against, and the values it tried to write.
     * `theirs` is not stored - it is read live, because it can move again
     * before the analyst answers.
     *
     * Both are unbounded `jsonb` from a client-supplied patch body. `mine` is
     * the parsed patch, so the entity schema bounds it; nothing bounds `base`.
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

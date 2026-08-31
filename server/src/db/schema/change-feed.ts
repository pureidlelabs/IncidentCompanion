/**
 * Every accepted write, in order, so an open screen elsewhere can repaint.
 *
 * **`seq` orders the log and is not a resume cursor.** A reconnecting client
 * refetches the case; do not add "give me everything after N" against this
 * column.
 *
 * `fields` names what the write set, which is what lets a merge review say
 * which field the other analyst also touched.
 */
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth.js'
import { cases } from './case.js'
import { caseScoped } from './scoped.js'

export const changeOp = pgEnum('change_op', ['insert', 'update', 'delete'])

export const changeFeed = pgTable(
  'change_feed',
  {
    seq: bigserial('seq', { mode: 'bigint' }).primaryKey(),

    /**
     * The room a repaint is broadcast to.
     *
     * **Cascades, so a deleted case takes its history with it.** The rows
     * describe writes to something that no longer exists, and a picker
     * replaying them would show activity against nothing. It is also what
     * makes the demo rebuild a single delete rather than two that can
     * disagree.
     */
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),

    /** Table name and row id, so a client knows what to invalidate. */
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),

    op: changeOp('op').notNull(),

    /** The row's version *after* this write. */
    version: integer('version').notNull(),

    /**
     * Null when the actor's account is gone, never because a write was
     * unattributed - an unattributed write is the defect this whole column
     * set exists to prevent.
     */
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),

    /** Field names only. The values are in the row; this is the diff's shape. */
    fields: jsonb('fields').$type<string[]>().notNull().default([]),

    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The only query this table serves: "everything in this case after seq".
    index('change_feed_case_seq_idx').on(table.caseId, table.seq),
    ...caseScoped(table.caseId),
  ],
)

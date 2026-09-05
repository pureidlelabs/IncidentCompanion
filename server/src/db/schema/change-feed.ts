/**
 * Every accepted write, in order, so an open screen elsewhere can repaint.
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

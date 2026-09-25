/**
 * Who had words accepted into which prose record since it was last stored.
 *
 * A row is written as the writer, under the writer's own reach, when their
 * first change to a record is accepted; the prose role may store that record
 * and name that writer only while a row says so, and removes the rows it
 * stored. -> `openspec/specs/live/design.md`
 *
 * **`record_id` names a report or a note, so it has no foreign key.** The case
 * cascade removes what is left when a case goes.
 */
import { sql } from 'drizzle-orm'
import { check, index, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { cases } from './case.js'
import { ACCEPTANCE_LASTS, caseScoped, proseKept } from './scoped.js'

export const proseAcceptances = pgTable(
  'prose_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    entity: text('entity', { enum: ['reports', 'casenotes'] }).notNull(),
    recordId: uuid('record_id').notNull(),
    // No foreign key: an account removed underneath its accepted words still
    // lets them be stored, naming nobody.
    writerId: text('writer_id').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('prose_acceptances_record_idx').on(t.recordId),
    check('prose_acceptances_entity', sql`${t.entity} in ('reports', 'casenotes')`),
    ...caseScoped(t.caseId),
    pgPolicy('acceptance_names_its_writer', {
      as: 'restrictive',
      for: 'insert',
      to: 'ic_app',
      withCheck: sql`${t.writerId} = nullif(current_setting('app.principal', true), '')`,
    }),
    ...proseKept(t.caseId, t.recordId, ['select', 'delete']),
    pgPolicy('an_expired_acceptance_is_swept', {
      for: 'delete',
      to: 'ic_app',
      using: sql`${t.acceptedAt} <= now() - ${sql.raw(`interval '${ACCEPTANCE_LASTS}'`)}`,
    }),
  ],
)

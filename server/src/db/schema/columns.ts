/**
 * The columns every case-owned row carries, so attribution is never retrofitted.
 *
 * **Spread these into a table rather than remembering to add them.** A table
 * omitting either fact cannot be made correct later - there is nothing to
 * backfill from.
 *
 * **`version` is checked, not trusted.** A write supplies the version it read
 * and the update matches on it; zero rows affected means someone else wrote
 * first, which is a merge review rather than an error. Incrementing it without
 * the `where` looks identical in a diff.
 *
 * `updatedBy` is the caller.
 */
import { customType, integer, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth.js'

export const rowVersioning = {
  /**
   * Starts at 1 and is the value a writer must present. Not a timestamp:
   * two writes inside the same clock tick are indistinguishable, and the
   * clocks on two app servers disagree.
   */
  version: integer('version').notNull().default(1),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  /**
   * `set null` rather than cascade: deleting an analyst must not delete the
   * evidence they entered. The row survives with its authorship unknown,
   * which is the honest state.
   */
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
}

/**
 * Postgres `bytea`, for a column holding a Yjs document.
 *
 * Drizzle 1.0 has no first-class bytea for node-postgres, so every table that
 * stores a document declares the same custom type. It is here rather than
 * beside one of them because the second table to need it copied the first.
 */
export const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType: () => 'bytea',
})

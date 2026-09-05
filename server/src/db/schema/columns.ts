/**
 * The columns every case-owned row carries, so attribution is never retrofitted.
 */
import { customType, integer, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth.js'

export const rowVersioning = {
  /**
   * Starts at 1 and is the value a writer must present.
   */
  version: integer('version').notNull().default(1),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  /**
   * `set null` rather than cascade: deleting an analyst must not delete the
   * evidence they entered.
   */
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
}

/**
 * Postgres `bytea`, for a column holding a Yjs document.
 */
export const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType: () => 'bytea',
})

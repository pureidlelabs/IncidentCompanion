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
import { sql } from 'drizzle-orm'
import { bigint, check, customType, integer, text, timestamp } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
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

/**
 * The largest figure a `figure()` column may hold.
 *
 * Not the column type's ceiling, which is `int8`'s and three orders of
 * magnitude higher. This is the largest integer a JavaScript number carries
 * exactly, and the read is a JavaScript number.
 */
export const FIGURE_CEILING = Number.MAX_SAFE_INTEGER

/**
 * A count or a money figure: held as `bigint`, read as a JavaScript number.
 *
 * **The column type alone is not the whole statement**, which is why this is a
 * pair rather than one helper. `mode: 'number'` hands the driver's string to
 * `Number` -- `drizzle-orm/node-postgres/codecs.cjs`, `bigint:number` --
 * so a stored figure past `FIGURE_CEILING` is rounded before anything can
 * refuse it, and the read schema then refuses the rounded value: neither what
 * was written nor a fault the analyst can act on. `figuresWithinReach` is what
 * stops such a figure being stored.
 */
export function figure(name: string) {
  return bigint(name, { mode: 'number' })
}

/**
 * A table's check that every `figure()` column on it is one the read can answer.
 *
 * Takes the columns rather than deriving them, because a column added to a
 * table and not to its check is the case this exists to prevent -- and there is
 * nothing in a table's own type that says which of its columns are figures.
 * -> `db/every-figure-is-within-reach.test.ts`
 */
export function figuresWithinReach(name: string, columns: readonly AnyPgColumn[]) {
  return check(
    name,
    sql.join(
      columns.map(
        (column) =>
          sql`(${column} is null or ${column} between 0 and ${sql.raw(String(FIGURE_CEILING))})`,
      ),
      sql` and `,
    ),
  )
}

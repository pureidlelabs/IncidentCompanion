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
 * Which door the row came through. Distinct from the timeline's `provenance`.
 *
 * Defaults to `manual`, so a row nothing stamped reads as the analyst's own
 * work -- which is what it is. An import door states its own name instead, and
 * `db/import-stamp.ts` is what narrows a stamp to the columns a table has: a
 * table without this one takes the stamp and stores nothing.
 */
export const source = () => text('source').notNull().default('manual')

/**
 * Postgres `bytea`.
 *
 * Drizzle 1.0 has no first-class bytea for node-postgres, so every table
 * storing bytes takes this one custom type.
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
 *
 * The floor is zero, which every schema above these columns already requires
 * -- `min(0)` or `nonnegative()` on each. Stated here as well so the column
 * holds a row arriving by a route that does not run them.
 */
export const FIGURE_CEILING = Number.MAX_SAFE_INTEGER

/**
 * A count or a money figure: held as `bigint`, read as a JavaScript number.
 *
 * **The column type alone is not the whole statement**, which is why this is a
 * pair rather than one helper. `mode: 'number'` hands the driver's string to
 * `Number` -- `drizzle-orm/node-postgres/codecs.cjs`, `bigint:number` -- so a
 * stored figure past `FIGURE_CEILING` is rounded before anything can refuse
 * it. What happens next depends on how the row is read, and both answers are
 * wrong: a compliance record is parsed and refuses the rounded value, so the
 * case stops answering; a collection row travels through a loose envelope and
 * the rounded figure is drawn as though it were the one stored.
 *
 * `figuresWithinReach` is what stops such a figure being stored at all.
 */
export function figure(name: string) {
  return bigint(name, { mode: 'number' })
}

/**
 * What drizzle calls a `bigint` read as a JavaScript number.
 *
 * The discriminator the check is derived from: it is exactly the set of
 * columns `figure()` builds, and it is carried by the column itself rather
 * than by a list beside it.
 */
const FIGURE_COLUMN = 'PgBigInt53'

/**
 * A table's check that every figure on it is one the read can answer.
 *
 * **Derived from the table, never listed.** A column added to a table and left
 * out of its check is the case this exists to prevent, and a hand-written list
 * relocates that mistake rather than removing it -- so the columns come from
 * the table's own types. Give it the table's columns; it finds the figures.
 *
 * Refuses a table holding no figure at all, which is a check declared where
 * there is nothing to check rather than a table that happens to be empty.
 * -> `db/every-figure-is-within-reach.test.ts`
 */
export function figuresWithinReach(name: string, columns: Record<string, AnyPgColumn>) {
  const figures = Object.values(columns).filter((one) => one.columnType === FIGURE_COLUMN)
  if (figures.length === 0) throw new Error(`${name} covers no figure column`)

  return check(
    name,
    sql.join(
      figures.map(
        (column) =>
          sql`(${column} is null or ${column} between 0 and ${sql.raw(String(FIGURE_CEILING))})`,
      ),
      sql` and `,
    ),
  )
}

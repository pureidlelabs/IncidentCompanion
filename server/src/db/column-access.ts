/**
 * Read a table's column by a name the code only knows at runtime.
 *
 * **Throws, naming the table and the column asked for.** The name cannot be
 * checked at compile time - the callers are the generic collection machinery -
 * so the alternative is `undefined` reaching drizzle, which builds a statement
 * around it and fails three layers down or matches more rows than it named.
 *
 * Not `schema/columns.ts`, which declares the columns every case-owned row
 * carries.
 */
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

/**
 * A table's columns keyed by name.
 *
 * Drizzle hangs each column off the table object as an own property, so this
 * is a view of the same object rather than a copy.
 */
export function columnsOf(table: PgTable): Record<string, PgColumn> {
  return table as unknown as Record<string, PgColumn>
}

/**
 * One column, or an error naming what was asked for.
 *
 * **The own-property check is not pedantry.** `toString`, `constructor` and
 * `hasOwnProperty` all answer a function on any object, so a plain lookup
 * would hand drizzle a prototype member for those names and fail somewhere
 * else entirely.
 */
export function columnOf(table: PgTable, name: string): PgColumn {
  const columns = columnsOf(table)
  if (!Object.prototype.hasOwnProperty.call(columns, name)) {
    const known = Object.keys(columns).sort().join(', ')
    throw new Error(`no column ${name} on this table. It has: ${known}`)
  }
  const found = columns[name]
  if (!found) throw new Error(`no column ${name} on this table`)
  return found
}

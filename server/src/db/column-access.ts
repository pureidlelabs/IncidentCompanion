/**
 * Read a table's column by a name the code only knows at runtime.
 */
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

/**
 * A table's columns keyed by name.
 */
export function columnsOf(table: PgTable): Record<string, PgColumn> {
  return table as unknown as Record<string, PgColumn>
}

/**
 * One column, or an error naming what was asked for.
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

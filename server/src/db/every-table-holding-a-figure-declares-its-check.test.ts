/**
 * **A table that holds a figure declares the check for it.**
 *
 * `figuresWithinReach` derives which of a table's columns are figures, so a
 * column added to a covered table is covered by being declared. What that
 * cannot reach is a table left out altogether: a new table with a `figure()`
 * column and no check is a figure nothing holds to what the read can carry,
 * and every other instrument here would be green.
 *
 * Read off the schema through drizzle rather than by grepping the source, so a
 * check declared under a different name, or spread in from a helper, still
 * counts.
 *
 * What no case here covers is whether the check was pushed -- that is
 * `every-figure-is-within-reach.test.ts`, which reads the database back.
 */
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import * as schema from './schema/index.js'

/** What drizzle calls a `bigint` read as a JavaScript number. */
const FIGURE_COLUMN = 'PgBigInt53'

/** Every exported table, by the name it is exported under. */
const TABLES: readonly (readonly [string, PgTable])[] = Object.entries(schema).filter(
  (entry): entry is [string, PgTable] => {
    const [, value] = entry
    if (typeof value !== 'object' || value === null) return false
    try {
      getTableConfig(value as PgTable)
      return true
    } catch {
      return false
    }
  },
)

describe('a table holding a figure', () => {
  it('finds the tables to check at all', () => {
    expect(TABLES.length, 'no tables read off the schema, so this sweeps nothing').toBeGreaterThan(
      10,
    )
  })

  it('declares a check for it', () => {
    const uncovered = TABLES.filter(([, table]) => {
      const config = getTableConfig(table)
      const figures = config.columns.filter((one) => one.columnType === FIGURE_COLUMN)
      return figures.length > 0 && config.checks.length === 0
    }).map(([name]) => name)

    expect(
      uncovered,
      'these hold a figure and declare no check, so it can hold one the read cannot carry',
    ).toEqual([])
  })

  /**
   * The sweep is worth nothing if it recognises no figure at all, which is
   * what a renamed column type would do to it.
   */
  it('recognises the figures it is written about', () => {
    const held = TABLES.flatMap(([, table]) =>
      getTableConfig(table).columns.filter((one) => one.columnType === FIGURE_COLUMN),
    )

    expect(held.length, 'no figure column found, so the check above passed over nothing').toBe(10)
  })
})

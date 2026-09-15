import { getTableConfig } from 'drizzle-orm/pg-core'
import type { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { INT4_MAX, rowVersion } from '../domain/column-bounds.js'
import * as schema from './schema/index.js'

/**
 * `INT4_MAX` is a claim about these columns, and this is what holds it.
 *
 * The doors bound a presented version at that number so an out-of-range one
 * is refused by name rather than by the driver. The bound is stated in
 * `domain/`, which may import nothing, and the column is declared in `db/`,
 * which `domain/` cannot reach -- so nothing but a test can put the two in one
 * file and ask whether they agree.
 *
 * **It fails in the direction that matters.** A column widened to `bigint`
 * leaves the bound refusing versions the column would now hold, and no suite
 * would otherwise notice: every existing version is small, so the tests go on
 * passing while the ceiling has quietly become wrong.
 */
const TABLES: readonly (readonly [string, PgTable])[] = Object.entries(schema).flatMap(
  ([name, value]) => {
    if (typeof value !== 'object' || value === null) return []
    try {
      getTableConfig(value as PgTable)
      return [[name, value as PgTable] as const]
    } catch {
      return []
    }
  },
)

describe('the version columns a presented version is compared against', () => {
  it('finds the tables to check at all', () => {
    expect(TABLES.length, 'no tables read off the schema, so this sweeps nothing').toBeGreaterThan(
      10,
    )
  })

  it('finds a version among them, or it is asserting over nothing', () => {
    const carrying = TABLES.filter(([, table]) =>
      getTableConfig(table).columns.some((one) => one.name === 'version'),
    )

    expect(carrying.length).toBeGreaterThan(5)
  })

  it('are every one an integer, which is what the bound assumes', () => {
    const wider = TABLES.flatMap(([name, table]) =>
      getTableConfig(table)
        .columns.filter((one) => one.name === 'version' && one.getSQLType() !== 'integer')
        .map((one) => `${name}.version is ${one.getSQLType()}`),
    )

    expect(wider.sort(), 'the bound refuses numbers these columns would hold').toEqual([])
  })

  it('states the ceiling a signed four-byte integer actually reaches', () => {
    expect(INT4_MAX).toBe(2 ** 31 - 1)
  })

  /**
   * The number the doors were reported throwing on, and the two either side of
   * the edge. Refused here means refused by the pipe with the field named,
   * rather than by the driver with a column named.
   */
  it('refuses a version no column could hold, and takes the largest one that fits', () => {
    expect(rowVersion().safeParse(4_294_967_296).success).toBe(false)
    expect(rowVersion().safeParse(INT4_MAX + 1).success).toBe(false)
    expect(rowVersion().safeParse(INT4_MAX).success).toBe(true)
    expect(rowVersion().safeParse(0).success, 'a stale check on a first version').toBe(true)
  })
})

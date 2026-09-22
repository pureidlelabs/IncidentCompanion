/**
 * **An archive's times are read from the column, never from the field name.**
 *
 * The importer matched `/At$|^time$/` against the key, which leaves
 * `malware.firstSeen`, `methods.windowFrom` and `methods.windowTo` uncoerced,
 * and wrote a string no date can be read from as a null rather than refusing
 * the archive. -> #1078
 *
 * Derived from the tables rather than from those three names: a timestamp
 * column added under a fourth spelling is covered by the first check here
 * without anybody remembering to add it.
 */
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { TABLES, coercedTimes } from './import.service.js'
import { malware } from '../db/schema/index.js'

const WHEN = '2026-01-02T03:04:05.000Z'

/** Every `[collection, column]` pair an archive could carry a time on. */
const TIMESTAMPS = TABLES.flatMap(([name, table]) =>
  Object.entries(getTableColumns(table))
    .filter(([, column]) => column.columnType.startsWith('PgTimestamp'))
    .map(([key]) => [name, key] as const),
)

describe('a time an archive states', () => {
  it('has timestamp columns to speak about', () => {
    expect(TIMESTAMPS.length).toBeGreaterThan(0)
  })

  it.each(TIMESTAMPS)('reaches the %s column %s as a date', (name, key) => {
    const table = TABLES.find(([each]) => each === name)![1]

    expect(
      coercedTimes(name, table, { [key]: WHEN })[key],
      'the column takes a time and the string the archive stated was passed through',
    ).toEqual(new Date(WHEN))
  })

  /**
   * **Refused, never written as a null.** A null in place of a stated time is
   * a case that is quietly not the case the operator exported, and the generic
   * write path refuses the same value at its schema.
   */
  it('is refused when no date can be read from it', () => {
    expect(() => coercedTimes('malware', malware, { firstSeen: 'not a date' })).toThrow(
      'this archive states a firstSeen in malware that this install cannot read',
    )
  })
})

/** An archive's times are read from the column, never from the field name. -> #1078 */
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

  /** Refused, never written as a null, as the generic write path refuses it. */
  it('is refused when no date can be read from it', () => {
    expect(() => coercedTimes('malware', malware, { firstSeen: 'not a date' })).toThrow(
      'this archive states a firstSeen in malware that this install cannot read',
    )
  })
})

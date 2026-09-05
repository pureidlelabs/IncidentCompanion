/**
 * Written from an attack on the accessor, not from its intention.
 */
import { describe, expect, it } from 'vitest'

import { PROTOTYPE_KEYS } from '../../test/prototype-keys.js'

import { columnOf, columnsOf } from './column-access.js'
import { systems } from './schema/entities.js'

describe('reading a column by a name computed at runtime', () => {
  it('finds a column the table has', () => {
    expect(columnOf(systems, 'id')).toBe(columnsOf(systems)['id'])
  })

  it('names the table and the column when there is no such column', () => {
    // The cast this replaces returned `undefined` here, and drizzle then built
    // a statement around it -- so the failure surfaced as an SQL error naming
    // nothing, or as a `where` clause that quietly matched every row.
    expect(() => columnOf(systems, 'no_such_column')).toThrow(/no_such_column/)
  })

  it('refuses a name that differs from a real column only in case', () => {
    expect(() => columnOf(systems, 'caseID')).toThrow(/caseID/)
  })

  /**
   * **`toString` is on every object, so a plain lookup finds a function.**
   */
  it.each(PROTOTYPE_KEYS)(
    'refuses %s, which is on the prototype rather than the table',
    (name) => {
      expect(() => columnOf(systems, name)).toThrow()
    },
  )
})

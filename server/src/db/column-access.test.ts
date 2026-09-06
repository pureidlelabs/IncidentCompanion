/**
 * Written from an attack on the accessor, not from its intention.
 *
 * The interesting inputs are the ones the cast it replaces answered
 * `undefined` for and handed to drizzle anyway: a name no table has, a name
 * that is a property of every JavaScript object, and one that differs from a
 * real column only in case.
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
    expect(() => columnOf(systems, 'no_such_column')).toThrow(/no_such_column/)
  })

  it('refuses a name that differs from a real column only in case', () => {
    expect(() => columnOf(systems, 'caseID')).toThrow(/caseID/)
  })

  it.each(PROTOTYPE_KEYS)(
    'refuses %s, which is on the prototype rather than the table',
    (name) => {
      expect(() => columnOf(systems, name)).toThrow()
    },
  )
})

/**
 * Every table the schema declares names what the serving and seeding roles may
 * do to it, so a table added later holds nothing nobody chose.
 */
import { is } from 'drizzle-orm'
import { PgTable, pgTable, text } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { CASE_WRITABLE } from '../domain/case.js'
import * as schema from './schema/index.js'
import { grants } from './schema/grants.js'

const declared = Object.values(schema as Record<string, unknown>).filter((value): value is PgTable => is(value, PgTable))

describe('the schema step grants', () => {
  it('each declared table exactly what its entry names', () => {
    expect(declared.length, 'no table found, so this asserts nothing').toBeGreaterThan(30)
    expect(() => grants(CASE_WRITABLE, declared)).not.toThrow()
  })

  it('nothing, and refuses to apply, for a table with no entry', () => {
    const scratch = pgTable('scratch_record', { id: text('id').primaryKey() })
    expect(() => grants(CASE_WRITABLE, [...declared, scratch])).toThrow(/scratch_record/)
  })
})

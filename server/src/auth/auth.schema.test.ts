/**
 * That the Drizzle schema still describes the tables Better Auth expects.
 */
import { getAuthTables } from 'better-auth/db'
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { authOptions } from './auth.config.js'
import * as schema from '../db/schema/auth.js'

/** Nothing here connects; the options are only read. */
const options = authOptions({} as never, 'not-a-real-secret-for-tests', 'https://127.0.0.1:8124')
const expected = getAuthTables(options)

/** Better Auth's model name -> the Drizzle table that holds it. */
const TABLES: Record<string, unknown> = {
  user: schema.user,
  session: schema.session,
  account: schema.account,
  verification: schema.verification,
}

describe('the tables Better Auth is configured to need', () => {
  it('are all declared', () => {
    // A plugin that adds a whole model - `organization`, say - fails here
    // rather than at the first request that touches it.
    expect(Object.keys(expected).sort()).toEqual(Object.keys(TABLES).sort())
  })

  it.each(Object.keys(expected))('%s has every field the config asks for', (model) => {
    const table = TABLES[model]
    expect(table, `no Drizzle table for the "${model}" model`).toBeDefined()

    // `id` is implicit in Better Auth's field list and explicit in Drizzle.
    const wanted = new Set(['id', ...Object.keys(expected[model]!.fields)])
    const declared = new Set(Object.keys(getTableColumns(table as never)))

    const missing = [...wanted].filter((one) => !declared.has(one))
    const extra = [...declared].filter((one) => !wanted.has(one))

    expect(missing, `${model} is missing columns the adapter will select`).toEqual([])
    // Extra is reported too: a column left behind after a plugin was removed
    // is dead weight that reads as part of the contract.
    expect(extra, `${model} declares columns nothing asks for`).toEqual([])
  })
})

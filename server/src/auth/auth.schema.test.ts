/**
 * That the Drizzle schema still describes the tables Better Auth expects.
 *
 * **`getAuthTables()` is the authority and it moves with the config.** Every
 * plugin adds models and fields - the admin plugin alone puts `role`,
 * `banned`, `banReason` and `banExpires` on `user` and `impersonatedBy` on
 * `session` - so a plugin enabled without re-deriving `db/schema/auth.ts`
 * leaves the adapter selecting a column that does not exist.
 *
 * **The failure it prevents is a runtime one, at sign-in**, and nothing
 * type-checks against the database. The integration tier does sign in for real
 * (`test/app-harness.ts`), so it would go red too - but as a sign-in that
 * failed, on a tier that skips in silence without a database. This one names
 * the missing column.
 *
 * **Names, not types.** Whether a column is `text` or `varchar` is Drizzle's
 * business and the adapter never asks; whether it is *there* is the whole
 * question. Comparing types would mean encoding Better Auth's type vocabulary
 * here, which is a second thing to keep true.
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
  apikey: schema.apikey,
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

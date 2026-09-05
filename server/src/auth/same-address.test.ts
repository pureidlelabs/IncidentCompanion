/**
 * The predicate, against a real Postgres.
 *
 * **Folding on the column is the half a stub cannot answer.** `lower(email) =
 * lower($1)` and `email = $1` are the same statement to a recording double and
 * different answers to a database, and it is the database that decides whether
 * an admin write reaches the row. So the row here is inserted directly, in the
 * one spelling no Better Auth path produces: a stored address that is not
 * lower-cased is what a lowered *argument* would fail to find, and is why the
 * fold is on the column.
 *
 * Skips rather than fails with no database, since a green run proving nothing
 * is worse than an obvious skip.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { openTestPool } from '../../test/database.js'
import { sameAddress } from './same-address.js'
import { user } from '../db/schema/auth.js'

const seedUrl = process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? ''
const pool = seedUrl ? openTestPool(seedUrl, 'ic_seed') : null
const db = pool ? drizzle({ client: pool }) : null

const ID = 'same-address-fixture'
/** Stored capitalised, which no path through Better Auth writes. */
const STORED = 'Stored.Capitalised@Example.Invalid'

describe.skipIf(!db)('sameAddress', () => {
  beforeAll(async () => {
    await db!.delete(user).where(sameAddress(STORED))
    await db!.insert(user).values({
      id: ID,
      name: 'Stored Capitalised',
      email: STORED,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterAll(async () => {
    await db!.delete(user).where(sameAddress(STORED))
    await pool?.end()
  })

  it('finds a capitalised row from a lower-cased address', async () => {
    const rows = await db!
      .select({ id: user.id })
      .from(user)
      .where(sameAddress(STORED.toLowerCase()))
    expect(rows.map((one) => one.id)).toEqual([ID])
  })

  it('finds a lower-cased row from a capitalised address', async () => {
    const other = 'lower.cased.row@example.invalid'
    await db!.insert(user).values({
      id: `${ID}-lower`,
      name: 'Lower Cased',
      email: other,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    try {
      const rows = await db!
        .select({ id: user.id })
        .from(user)
        .where(sameAddress('Lower.Cased.Row@Example.Invalid'))
      expect(rows.map((one) => one.id)).toEqual([`${ID}-lower`])
    } finally {
      await db!.delete(user).where(sameAddress(other))
    }
  })

  it('does not match a different address', async () => {
    const rows = await db!
      .select({ id: user.id })
      .from(user)
      .where(sameAddress('someone.else@example.invalid'))
    expect(rows).toEqual([])
  })
})

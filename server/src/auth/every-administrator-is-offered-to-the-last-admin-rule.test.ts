/**
 * The rule that keeps an install administrable is handed every administrator.
 *
 * `stranding` decides by counting administrators within what it is given, so
 * what it is given has to be all of them. Handed a page it answers about the
 * page: a roster capped at 500 rows that happens not to hold the target
 * reports no administrator remaining, and the last one can be disabled.
 * -> #632, `auth/last-admin.ts`
 *
 * **Narrowed by role and nothing else.** Whether a banned administrator counts
 * is `administers`' decision, and half of it in SQL is two halves that can
 * disagree.
 *
 * **What this does not cover:** that the query carries no ceiling, which is a
 * fact about its text rather than about a few rows, and `stranding` itself,
 * which is `last-admin.test.ts`.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { openTestPool } from '../../test/database.js'
import { user } from '../db/schema/auth.js'
import { AccountLookupService } from './account-lookup.service.js'

const seedUrl = process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? ''
const pool = seedUrl ? openTestPool(seedUrl, 'ic_seed') : null
const db = pool ? drizzle({ client: pool }) : null

const IDS = ['counted-admin-1', 'counted-admin-2', 'counted-banned-admin', 'counted-analyst']

const rowFor = (id: string, role: string, banned = false) => ({
  id,
  name: id,
  email: `${id}@example.invalid`,
  emailVerified: false,
  role,
  banned,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe.skipIf(!db)('the administrators handed to the last-admin rule', () => {
  const lookup = new AccountLookupService(db!)

  beforeAll(async () => {
    await db!.delete(user).where(inArray(user.id, IDS))
    await db!.insert(user).values([
      rowFor('counted-admin-1', 'admin'),
      rowFor('counted-admin-2', 'admin'),
      rowFor('counted-banned-admin', 'admin', true),
      rowFor('counted-analyst', 'analyst'),
    ])
  })

  afterAll(async () => {
    await db!.delete(user).where(inArray(user.id, IDS))
    await pool?.end()
  })

  it('holds every account with the role, banned ones included', async () => {
    const found = (await lookup.administrators()).map((one) => one.id).filter((id) => IDS.includes(id))

    expect(
      found.sort(),
      'an administrator was left out, so the count the rule makes is of a subset',
    ).toEqual(['counted-admin-1', 'counted-admin-2', 'counted-banned-admin'])
  })

  it('holds nobody without it', async () => {
    const found = (await lookup.administrators()).map((one) => one.id)

    expect(found).not.toContain('counted-analyst')
  })

  /** `administers` reads both, so both have to survive the query. */
  it('carries the role and the ban, which are what decide who counts', async () => {
    const banned = (await lookup.administrators()).find((one) => one.id === 'counted-banned-admin')

    expect(banned?.role).toBe('admin')
    expect(banned?.banned).toBe(true)
  })
})

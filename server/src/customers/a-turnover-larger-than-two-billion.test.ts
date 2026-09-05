/**
 * **An organisation's annual turnover does not fit in an `integer`.**
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { caseCompliance } from '../db/schema/case-compliance.js'
import { cases, customers } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/** Comfortably past `int4`, and an ordinary figure for an entity in scope. */
const THREE_BILLION = 3_000_000_000

afterAll(async () => {
  if (seed) {
    await seed.delete(cases)
    await seed.delete(customers)
  }
  await pool?.end()
})

describe.skipIf(!db)('a turnover larger than two billion', () => {
  beforeEach(async () => {
    await seed!.delete(cases)
    await seed!.delete(customers)
  })

  it('is held by the customer that answered it', async () => {
    const [made] = await seed!
      .insert(customers)
      .values({ name: 'Large Entity NV', annualTurnoverEur: THREE_BILLION })
      .returning()

    const [read] = await seed!.select().from(customers).where(eq(customers.id, made!.id))
    expect(Number(read!.annualTurnoverEur)).toBe(THREE_BILLION)
  })

  it('is held by the case that copied it', async () => {
    const [row] = await seed!.insert(cases).values({ title: 'A large entity' }).returning()
    await seed!
      .insert(caseCompliance)
      .values({ caseId: row!.id, annualTurnoverEur: THREE_BILLION })

    const [read] = await seed!
      .select()
      .from(caseCompliance)
      .where(eq(caseCompliance.caseId, row!.id))
    expect(Number(read!.annualTurnoverEur)).toBe(THREE_BILLION)
  })
})

/**
 * A file clearing customers succeeds whatever an earlier file left on one. -> #1212
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, describe, expect, it } from 'vitest'

import { cases } from '../db/schema/case.js'
import { customers } from '../db/schema/customer.js'
import { clearCustomers } from '../../test/customers.js'
import { openTestPool } from '../../test/database.js'

const url = process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL
const pool = url ? openTestPool(url, 'ic_seed') : null
const seed = pool ? drizzle({ client: pool }) : null

afterAll(async () => {
  await pool?.end()
})

describe.skipIf(!seed)('clearing customers', () => {
  it('removes a customer an earlier file left a case on', async () => {
    const [left] = await seed!.insert(customers).values({ name: 'Left behind' }).returning()
    await seed!.insert(cases).values({ title: 'A case nobody cleaned up', customerId: left!.id })

    await clearCustomers(seed!)

    expect(await seed!.select().from(customers).where(eq(customers.id, left!.id))).toEqual([])
    expect(await seed!.select().from(cases).where(eq(cases.customerId, left!.id))).toEqual([])
  })
})

/**
 * The customer record, against a real database.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CustomersService } from './customers.service.js'
import { cases, customers } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('the customer directory', () => {
  let service: CustomersService

  beforeAll(() => {
    service = new CustomersService(db!)
  })

  afterAll(async () => {
    await pool?.end()
    await seedPool?.end()
  })

  /**
   * **The install is usable before anybody is onboarded**, which is what the
   * default customer is for: an incident whose origin is not yet known still
   * opens a case.
   */
  it('holds a default customer, and asking twice does not make a second', async () => {
    const first = await service.ensureDefault()
    const again = await service.ensureDefault()

    expect(first.id).toBe(again.id)

    const defaults = await db!.select().from(customers).where(eq(customers.isDefault, true))
    expect(defaults, 'the install holds more than one default').toHaveLength(1)
  })

  /**
   * **Exactly one, enforced by the database.**
   */
  it('refuses a second default, whatever asks for one', async () => {
    await service.ensureDefault()

    const refused = await seed!
      .insert(customers)
      .values({ name: 'A rival default', isDefault: true })
      .catch((why: unknown) => why)

    expect(refused, 'the database accepted a second default').toBeInstanceOf(Error)
  })

  /**
   * **The name is not the identity.**
   */
  it('keeps a case pointing at the same customer across a rename', async () => {
    const [made] = await seed!
      .insert(customers)
      .values({ name: 'Northwind Trading' })
      .returning({ id: customers.id })

    const [opened] = await seed!
      .insert(cases)
      .values({ title: 'A case for Northwind', customerId: made!.id })
      .returning({ id: cases.id, customerId: cases.customerId })

    await seed!
      .update(customers)
      .set({ name: 'Northwind Logistics' })
      .where(eq(customers.id, made!.id))

    const [after] = await seed!.select().from(cases).where(eq(cases.id, opened!.id))
    expect(after!.customerId, 'the rename moved the case to another customer').toBe(made!.id)

    const [renamed] = await seed!.select().from(customers).where(eq(customers.id, made!.id))
    expect(renamed!.name, 'the rename did not take').toBe('Northwind Logistics')

    await seed!.delete(cases).where(eq(cases.id, opened!.id))
    await seed!.delete(customers).where(eq(customers.id, made!.id))
  })

  /**
   * **A customer cannot be removed out from under its cases.**
   */
  it('refuses to delete a customer a case still points at', async () => {
    const [made] = await seed!
      .insert(customers)
      .values({ name: 'Contoso Health' })
      .returning({ id: customers.id })
    const [opened] = await seed!
      .insert(cases)
      .values({ title: 'A case for Contoso', customerId: made!.id })
      .returning({ id: cases.id })

    const refused = await seed!
      .delete(customers)
      .where(eq(customers.id, made!.id))
      .catch((why: unknown) => why)

    expect(refused, 'the customer was deleted out from under its case').toBeInstanceOf(Error)

    const [still] = await seed!.select().from(customers).where(eq(customers.id, made!.id))
    expect(still, 'the customer is gone').toBeDefined()

    await seed!.delete(cases).where(eq(cases.id, opened!.id))
    await seed!.delete(customers).where(eq(customers.id, made!.id))
  })
})

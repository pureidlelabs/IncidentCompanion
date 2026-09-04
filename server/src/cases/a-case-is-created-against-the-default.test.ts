/**
 * *A case always has a customer.* Where nobody knows whose incident it is,
 * that customer is the install's default **rather than an absence** --
 * `openspec/specs/cases/design.md`, and the customers specification says the
 * same from the other side: *it is created against the default customer*.
 *
 * **An absence is what the column held.** Every reader coped by resolving null
 * to the default itself, which made the two states indistinguishable
 * downstream and left a uniqueness rule over `(customer_id, reference)` with
 * nothing to compare -- Postgres treats each null as its own value.
 */
import { eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { CasesService } from './cases.service.js'
import { CustomersModule } from '../customers/customers.module.js'
import { CustomersService } from '../customers/customers.service.js'
import { cases, customers, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'opens-a-case'

afterAll(async () => {
  if (seed && db) {
    await seed.delete(cases)
    await seed.delete(customers)
    // **The install is left holding its default.** Emptying `customers` and
    // stopping there hands the next file an install with none, which is a
    // state nothing else in the suite is written against.
    await new CustomersService(db).ensureDefault()
  }
  await pool?.end()
  if (seedPool !== pool) await seedPool?.end()
})

describe.skipIf(!db)('a case opened before anybody is onboarded', () => {
  let cases_: CasesService
  let customers_: CustomersService
  let theDefault: string

  beforeEach(async () => {
    await seed!.delete(cases)
    await seed!.delete(customers)

    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Opens A Case',
        email: 'opens@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    customers_ = new CustomersService(db!)
    cases_ = new CasesService(db!)
    theDefault = (await customers_.ensureDefault()).id
  })

  it('is created against the default customer', async () => {
    const made = await cases_.create({ title: 'Nobody knows whose yet' }, ANALYST)

    expect(made.customerId, 'the case was created against an absence').toBe(theDefault)
  })

  /**
   * **The specification describes the cases an install already holds**, not
   * only the ones it has yet to open, so the absence is corrected where the
   * default is ensured rather than left for whoever reads the row next.
   */
  it('corrects a case that was created against nothing', async () => {
    const [older] = await seed!
      .insert(cases)
      .values({ title: 'Opened before the directory landed' })
      .returning()
    expect(older!.customerId, 'the fixture did not reproduce the state').toBeNull()

    await new CustomersModule(customers_).onModuleInit()

    const [now] = await seed!.select().from(cases).where(eq(cases.id, older!.id))
    expect(now!.customerId).toBe(theDefault)
  })

  it('leaves an attributed case where it is', async () => {
    const [northwind] = await seed!
      .insert(customers)
      .values({ name: 'Northwind BV' })
      .returning()
    const [theirs] = await seed!
      .insert(cases)
      .values({ title: 'Already attributed', customerId: northwind!.id })
      .returning()

    await new CustomersModule(customers_).onModuleInit()

    const [now] = await seed!.select().from(cases).where(eq(cases.id, theirs!.id))
    expect(now!.customerId, 'the correction reached a case it should not').toBe(northwind!.id)
  })

  it('leaves no case against an absence', async () => {
    await cases_.create({ title: 'One' }, ANALYST)
    await cases_.create({ title: 'Two' }, ANALYST)

    const orphans = await seed!.select().from(cases).where(isNull(cases.customerId))
    expect(orphans).toHaveLength(0)
  })
})

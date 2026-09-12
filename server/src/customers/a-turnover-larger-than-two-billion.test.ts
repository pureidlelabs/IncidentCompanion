/**
 * **An organisation's annual turnover does not fit in an `integer`.**
 *
 * `int4` stops at 2,147,483,647, which is EUR 2.1bn - and the regimes that ask
 * for this figure ask it of exactly the entities above that line. NIS2 sizes
 * an essential entity by turnover; a bank inside DORA's scope is routinely a
 * multiple of it. The column would refuse the answer for the organisations the
 * question is for.
 *
 * **Asserted against Postgres rather than the ORM**, because the ceiling is
 * the column type's and Drizzle will happily hand it a number that the
 * database then refuses.
 *
 * The same fact lives on the case as a copy, so both are checked: a customer
 * that can hold the figure and a case that cannot would fail at the moment the
 * copy is taken, which is further from the cause.
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
    expect(read!.annualTurnoverEur).toBe(THREE_BILLION)
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
    expect(read!.annualTurnoverEur).toBe(THREE_BILLION)
  })

  /**
   * **What the incident cost has the same ceiling and is asked of the same
   * entities.** DORA asks a financial entity for a major incident's costs and
   * losses and NIS2 for the economic damage; nothing about a supply-chain or
   * ransomware event at a bank is bounded by EUR 2bn, and the column would be
   * the thing that decided the answer.
   *
   * **Written here rather than in a file of its own**, because the ceiling is
   * one fact about one table: three euro columns on the same row, asked by the
   * same regimes of the same organisations. A second file would be the place
   * the fourth column is forgotten.
   */
  it('does not cap what the incident itself cost', async () => {
    const [row] = await seed!.insert(cases).values({ title: 'A costly incident' }).returning()
    await seed!.insert(caseCompliance).values({
      caseId: row!.id,
      financialLossEur: THREE_BILLION,
      doraCostsEur: THREE_BILLION,
    })

    const [read] = await seed!
      .select()
      .from(caseCompliance)
      .where(eq(caseCompliance.caseId, row!.id))

    expect(
      read!.financialLossEur,
      'the loss an incident caused does not fit the column that holds it',
    ).toBe(THREE_BILLION)
    expect(
      read!.doraCostsEur,
      'the costs DORA asks for do not fit the column that holds them',
    ).toBe(THREE_BILLION)
  })

  /**
   * **How many people an incident reached has the same ceiling, and the same
   * reader.** NIS2's implementing regulation asks for the number of affected
   * recipients and the total the entity serves; a social network is Annex II
   * by name, and the 2013 Yahoo breach was three billion accounts. The column
   * refuses that figure with the same `22003` the euro columns did.
   *
   * **Read without `Number()`, on purpose.** The wrapper would convert a
   * string return and pass, and a string is not harmless here: the compliance
   * gates compare these with `>`, where `'3000000000' > 500000` is a lexical
   * comparison that answers false. Asserting the raw value is what makes the
   * read a check on the type as well as the magnitude.
   */
  it('does not cap how many people an incident reached', async () => {
    const [row] = await seed!.insert(cases).values({ title: 'A wide incident' }).returning()
    await seed!.insert(caseCompliance).values({
      caseId: row!.id,
      usersAffectedCount: THREE_BILLION,
      usersTotalCount: THREE_BILLION,
    })

    const [read] = await seed!
      .select()
      .from(caseCompliance)
      .where(eq(caseCompliance.caseId, row!.id))

    expect(read!.usersAffectedCount, 'the count NIS2 asks for does not fit').toBe(THREE_BILLION)
    expect(read!.usersTotalCount, 'the entity cannot state its own user base').toBe(THREE_BILLION)
  })

  /** The copy source, which refuses the figure before the case ever sees it. */
  it('is held by the customer whose user base it is', async () => {
    const [made] = await seed!
      .insert(customers)
      .values({ name: 'Wide Entity NV', usersTotalCount: THREE_BILLION })
      .returning()

    const [read] = await seed!.select().from(customers).where(eq(customers.id, made!.id))
    expect(read!.usersTotalCount).toBe(THREE_BILLION)
  })
})

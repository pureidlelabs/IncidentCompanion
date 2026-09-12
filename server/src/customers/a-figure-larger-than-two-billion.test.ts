/**
 * **A figure a regime asks a large entity for does not fit in an `integer`.**
 *
 * `int4` stops at 2,147,483,647, and the regimes that ask for these figures
 * ask them of exactly the entities above that line: EUR 2.1bn of turnover is
 * inside the range NIS2 sizes an essential entity by, and one breach has
 * reached three billion accounts. The column would refuse the answer for the
 * organisations the question is for.
 *
 * **Asserted against Postgres rather than the ORM**, because the ceiling is
 * the column type's and Drizzle will happily hand it a number that the
 * database then refuses.
 *
 * **One file for the rule rather than one per column**, across every table
 * that holds such a figure -- the organisation, its case's copy, and the
 * impact rows the case counts. A file per column is where the next one is
 * forgotten, which is how the euro columns came to be widened two at a time.
 *
 * Columns whose answers cannot reach the ceiling are asserted nowhere, and the
 * schema is where each says so.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { caseCompliance } from '../db/schema/case-compliance.js'
import { cases, customers, impact } from '../db/schema/index.js'
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

describe.skipIf(!db)('a figure larger than two billion', () => {
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
   * **Read without `Number()`**, which would convert a string return and pass:
   * the raw value checks the declared `mode: 'number'` mapping as well as the
   * magnitude, and the mapping is what every arithmetic reader assumes.
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

  /**
   * **The same figure on the row an analyst actually counts it on.** The
   * compliance answers are a summary; `impact` is where the per-category
   * counting happens, and its own docstring cites Art 33(3)(a) - the
   * approximate number of data subjects, inside 72 hours. `volume_bytes` on
   * the same row was widened for this reason and these two were left.
   */
  it('does not cap how many subjects or records one impact reached', async () => {
    const [row] = await seed!.insert(cases).values({ title: 'A wide impact' }).returning()
    await seed!.insert(impact).values({
      caseId: row!.id,
      subjectCount: THREE_BILLION,
      recordCount: THREE_BILLION,
    })

    const [read] = await seed!.select().from(impact).where(eq(impact.caseId, row!.id))
    expect(read!.subjectCount, 'the count Art 33(3)(a) asks for does not fit').toBe(THREE_BILLION)
    expect(read!.recordCount, 'the records a breach touched do not fit').toBe(THREE_BILLION)
  })
})

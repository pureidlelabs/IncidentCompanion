/**
 * **Not there and not yours MUST be indistinguishable** -- the second
 * paragraph of `the-api`'s refusal requirement, and the scenario under it:
 *
 * Asserted on the **status and the body**, because a status that matches while
 * the sentence differs is the same oracle wearing a hat.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cases, customers } from '../src/db/schema/index.js'
import { boot, bootable, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'

const runnable = await bootable()

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

/** A well-formed uuid that names nothing. */
const ABSENT = '00000000-0000-4000-8000-000000000000'

describe.skipIf(!runnable || !seed)('not there and not yours look alike', () => {
  let harness: Harness
  let analyst: Persona
  let theirCase = ''
  let theirCustomer = ''

  beforeAll(async () => {
    harness = await boot()
    analyst = await sharedAnalyst(harness)

    /**
     * A customer this analyst reaches through no group, and a case against it.
     */
    const [customer] = await seed!
      .insert(customers)
      .values({ name: `Out of reach ${String(Date.now())}` })
      .returning({ id: customers.id })
    theirCustomer = customer!.id

    const [row] = await seed!
      .insert(cases)
      .values({ title: 'A case this analyst does not reach', customerId: theirCustomer })
      .returning({ id: cases.id })
    theirCase = row!.id
  }, 90_000)

  afterAll(async () => {
    if (seed && theirCase) await seed.delete(cases).where(eq(cases.id, theirCase))
    if (seed && theirCustomer) await seed.delete(customers).where(eq(customers.id, theirCustomer))
    await harness?.close()
    await seedPool?.end()
  })

  const ask = async (id: string) => {
    const answer = await fetch(`${harness.base}/api/cases/${id}`, {
      headers: { cookie: analyst.cookie },
    })
    return { status: answer.status, body: await answer.text() }
  }

  /**
   * **The premise.**
   */
  it('has a case that exists and that this analyst does not reach', async () => {
    const stored = await seed!.select({ id: cases.id }).from(cases).where(eq(cases.id, theirCase))
    expect(stored, 'the fixture case is not in the database').toHaveLength(1)

    const answer = await ask(theirCase)
    expect(answer.status, 'the analyst reached a case they should not').not.toBe(200)
  }, 30_000)

  it('answers a case out of reach exactly as it answers one that is not there', async () => {
    const theirs = await ask(theirCase)
    const absent = await ask(ABSENT)

    expect(theirs.status, 'the two refusals carry different statuses').toBe(absent.status)
    expect(
      theirs.body.replace(theirCase, '{id}'),
      'the two refusals read differently, so the id can be told apart',
    ).toBe(absent.body.replace(ABSENT, '{id}'))
  }, 30_000)

  it('refuses with not-found rather than forbidden', async () => {
    expect((await ask(theirCase)).status).toBe(404)
  }, 30_000)
})

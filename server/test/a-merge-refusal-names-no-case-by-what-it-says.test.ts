/**
 * A merge refused on a shared reference names the two cases, and nothing
 * either one says.
 *
 * *THEN the merge is refused until one is changed, AND the analyst is told
 * which two cases collide, AND nothing either case holds is shown beyond its
 * identifier and the reference.*
 *
 * **Through the route an administrator merges by**, as an administrator who
 * reaches neither customer: being one grants no case, so a refusal quoting a
 * title hands them what the store would refuse them.
 */
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { cases, customers } from '../src/db/schema/index.js'

const TAG = `${String(process.pid)}-${String(Date.now())}`
const SHARED = `INC-MERGE-${TAG}`
const LOSING_SAYS = `The losing side's incident ${TAG}`
const SURVIVING_SAYS = `The surviving side's incident ${TAG}`

let harness: Harness
let admin: Persona
let seedPool: ReturnType<typeof openTestPool>
let losing = ''
let surviving = ''
const made: string[] = []

const seed = () => drizzle({ client: seedPool })

describe.skipIf(!(await bootable()))('a merge refused on a shared reference', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')

    const [a, b] = await seed()
      .insert(customers)
      .values([{ name: `Northwind ${TAG}` }, { name: `Northwind B.V. ${TAG}` }])
      .returning()
    losing = a!.id
    surviving = b!.id
    const rows = await seed()
      .insert(cases)
      .values([
        { title: LOSING_SAYS, reference: SHARED, customerId: losing },
        { title: SURVIVING_SAYS, reference: SHARED, customerId: surviving },
      ])
      .returning({ id: cases.id })
    made.push(...rows.map((row) => row.id))
  }, 90_000)

  afterAll(async () => {
    await seed().delete(cases).where(inArray(cases.id, made))
    await seed()
      .delete(customers)
      .where(inArray(customers.id, [losing, surviving]))
    await seedPool?.end()
    await harness?.close()
  })

  it('names both cases by id and the reference, and quotes neither', async () => {
    const answer = await fetch(`${harness.base}/api/customers/${surviving}/merge`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ losing }),
    })
    const said = await answer.text()

    expect(answer.status, said).toBe(409)
    for (const id of made) expect(said, 'a colliding case is not named').toContain(id)
    expect(said).toContain(SHARED)
    expect(said, 'the refusal quoted a case the administrator does not reach').not.toContain(
      LOSING_SAYS,
    )
    expect(said, 'the refusal quoted a case the administrator does not reach').not.toContain(
      SURVIVING_SAYS,
    )

    const [kept] = await seed().select().from(customers).where(eq(customers.id, losing))
    expect(kept, 'a refused merge took the losing record anyway').toBeDefined()
  })
})

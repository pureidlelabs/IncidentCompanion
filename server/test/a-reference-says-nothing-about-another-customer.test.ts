/** A write naming a row of a customer its caller does not reach is answered as one naming no row. */
import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { cases, customers, systems } from '../src/db/schema/index.js'

const STAMP = `${String(process.pid)}-${String(Date.now())}`

describe.skipIf(!(await bootable()))('a write naming a row of another customer', () => {
  let harness: Harness
  let analyst: Persona
  let seedPool: ReturnType<typeof openTestPool>
  let customer = ''
  let theirCase = ''
  let theirSystem = ''
  let ourCase = ''

  beforeAll(async () => {
    harness = await boot()
    analyst = await sharedAnalyst(harness)
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')
    const seed = drizzle({ client: seedPool })
    const [made] = await seed.insert(customers).values({ name: `Unreached ${STAMP}` }).returning({ id: customers.id })
    customer = made!.id
    const [kase] = await seed.insert(cases).values({ title: `Theirs ${STAMP}`, customerId: customer }).returning({ id: cases.id })
    theirCase = kase!.id
    const [system] = await seed.insert(systems).values({ caseId: theirCase, hostname: `theirs-${STAMP}` }).returning({ id: systems.id })
    theirSystem = system!.id
    const opened = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { cookie: analyst.cookie, 'content-type': 'application/json', origin: harness.origin },
      body: JSON.stringify({ title: `Ours ${STAMP}` }),
    })
    ourCase = ((await opened.json()) as { id: string }).id
  }, 120_000)

  afterAll(async () => {
    const seed = drizzle({ client: seedPool })
    await seed.delete(cases).where(eq(cases.id, theirCase))
    await seed.delete(cases).where(eq(cases.id, ourCase))
    await seed.delete(customers).where(eq(customers.id, customer))
    await seedPool?.end()
    await harness?.close()
  })

  it('answers a reference to a row of another customer as it answers one to no row', async () => {
    const naming = async (systemId: string) => {
      const answer = await fetch(`${harness.base}/api/cases/${ourCase}/impact`, {
        method: 'POST',
        headers: { cookie: analyst.cookie, 'content-type': 'application/json', origin: harness.origin },
        body: JSON.stringify({ label: `Named ${STAMP}`, systemId }),
      })
      return { status: answer.status, said: (await answer.text()).replaceAll(systemId, '{systemId}') }
    }

    const theirs = await naming(theirSystem)
    expect(theirs).toEqual(await naming(randomUUID()))
    expect(theirs.status).toBeGreaterThanOrEqual(400)
  })
})

/**
 * A case out of reach answers exactly as a case that does not exist.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { cases } from '../src/db/schema/case.js'
import { customers } from '../src/db/schema/customer.js'
import { openTestPool } from './database.js'

const PASSWORD = 'a-password-long-enough-to-pass'
const CHOSEN = 'the-password-they-chose-themselves'
const ANALYST = `out-of-reach-${String(Date.now())}@example.test`

/** A well-formed id that names nothing. */
const ABSENT = '00000000-0000-4000-8000-000000000000'

let harness: Harness | null = null
let admin: Persona
let analyst: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let theirs = ''
let ours = ''
let customerId = ''

interface Answer {
  status: number
  body: string
}

/** The answer, with any uuid replaced so two questions compare as one. */
async function ask(cookie: string, caseId: string): Promise<Answer> {
  const answer = await fetch(`${harness!.base}/api/cases/${caseId}`, { headers: { cookie } })
  const body = (await answer.text()).replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '{id}',
  )
  return { status: answer.status, body }
}

describe.skipIf(!(await bootable()))('a case an analyst does not reach', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: ANALYST,
        displayName: 'Out Of Reach Analyst',
        password: PASSWORD,
        role: 'analyst',
      }),
    })
    expect(made.status, `creating the account answered ${await made.text()}`).toBe(201)

    analyst = await signIn(harness, ANALYST, PASSWORD)
    const lifted = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ current: PASSWORD, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(lifted.status, 'the password hold was not lifted, so every route refuses').toBe(200)
    analyst = await signIn(harness, ANALYST, CHOSEN)

    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    const db = drizzle({ client: pool })

    const [customer] = await db
      .insert(customers)
      .values({ name: `Unreached ${String(Date.now())}` })
      .returning({ id: customers.id })
    customerId = customer!.id
    const [fallback] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.isDefault, true))
      .limit(1)

    const [one] = await db
      .insert(cases)
      .values({ title: 'On a customer they do not reach', customerId })
      .returning({ id: cases.id })
    theirs = one!.id
    const [two] = await db
      .insert(cases)
      .values({ title: 'On the default customer', customerId: fallback!.id })
      .returning({ id: cases.id })
    ours = two!.id
  }, 90_000)

  afterAll(async () => {
    const db = drizzle({ client: pool! })
    await db.delete(cases).where(eq(cases.id, theirs))
    await db.delete(cases).where(eq(cases.id, ours))
    await db.delete(customers).where(eq(customers.id, customerId))
    await pool?.end()
    await harness?.close()
  })

  it('reaches the case it is meant to, so the refusals below are a choice', async () => {
    expect(
      (await ask(analyst.cookie, ours)).status,
      'the analyst reaches nothing at all, so two matching refusals say nothing',
    ).toBe(200)
  })

  it('answers a case out of reach exactly as one that does not exist', async () => {
    const outOfReach = await ask(analyst.cookie, theirs)
    const notThere = await ask(analyst.cookie, ABSENT)

    expect(outOfReach.status, 'a case out of reach was served').not.toBe(200)
    expect(
      outOfReach,
      'the two refusals differ, so a caller learns that a case exists on a customer they ' +
        'were not given',
    ).toEqual(notThere)
  })
})

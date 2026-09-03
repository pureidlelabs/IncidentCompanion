/**
 * A case opened with a title and no customer is reachable by every analyst.
 *
 * *THEN the case is created against the install's default customer, AND every
 * analyst may reach it.*
 *
 * **What is asserted is the reach, not the column.** `cases.customerId` is
 * nullable and `CasesService.create` does not fill it in, so the case is stored
 * carrying no customer; `CaseAccessGuard` resolves `row.customerId ??
 * defaultCustomerId` and the case therefore *behaves* as the default's. The
 * scenario is about who may reach it, and that is what this holds.
 *
 * The difference is not nothing and is deliberately left alone here: a case
 * with a null customer follows whichever customer is default, where a case
 * stamped with the default would not. Which of the two the specification means
 * is a question for whoever owns the customer directory, and this test does not
 * settle it by asserting either.
 *
 * **The analyst is in no group**, which is what makes *every analyst* the
 * claim rather than *the analyst who happened to be granted something*.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { cases } from '../src/db/schema/case.js'
import { groupMembers } from '../src/db/schema/groups.js'
import { openTestPool } from './database.js'

const PASSWORD = 'a-password-long-enough-to-pass'
const CHOSEN = 'the-password-they-chose-themselves'
const ANALYST = `no-customer-${String(Date.now())}@example.test`

let harness: Harness | null = null
let admin: Persona
let analyst: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let caseId = ''

describe.skipIf(!(await bootable()))('a case opened before its customer is known', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: ANALYST,
        displayName: 'Unknown Origin Analyst',
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

    // Opened the way the scenario says: a title, and nothing about a customer.
    const opened = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'An incident of unknown origin' }),
    })
    // Read once: a body consumed by an assertion message cannot be parsed
    // afterwards, and the template literal is evaluated whether or not it fails.
    const body = await opened.text()
    expect(opened.status, `opening the case answered ${body}`).toBe(201)
    caseId = (JSON.parse(body) as { id: string }).id
    expect(caseId, 'the created case came back without an id').not.toBe('')
  }, 90_000)

  afterAll(async () => {
    if (pool && caseId !== '') {
      await drizzle({ client: pool }).delete(cases).where(eq(cases.id, caseId))
    }
    await pool?.end()
    await harness?.close()
  })

  it('belongs to nobody in the customer directory', async () => {
    const db = drizzle({ client: pool! })
    const [row] = await db
      .select({ customerId: cases.customerId })
      .from(cases)
      .where(eq(cases.id, caseId))

    expect(row, 'the case was not created at all').toBeDefined()
    expect(
      row!.customerId,
      'the case was stamped with a customer, so what the guard resolves is no longer what ' +
        'this file is about -- read the docstring before changing the assertion',
    ).toBeNull()
  })

  it('is in no group, so reaching it cannot be a grant', async () => {
    const db = drizzle({ client: pool! })
    const held = await db.select().from(groupMembers).where(eq(groupMembers.userId, analyst.id))
    expect(held, 'the analyst holds a membership, so this is not every analyst').toHaveLength(0)
  })

  it('is reached by an analyst who was granted nothing', async () => {
    const answer = await fetch(`${harness!.base}/api/cases/${caseId}`, {
      headers: { cookie: analyst.cookie },
    })
    expect(
      answer.status,
      'a case opened with no customer is out of reach, so an incident of unknown origin ' +
        'cannot be worked by whoever picks it up',
    ).toBe(200)
  })
})

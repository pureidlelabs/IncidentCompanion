/**
 * A case opened with a title and no customer is reachable by every analyst.
 *
 * *THEN the case is created against the install's default customer, AND every
 * analyst may reach it.*
 *
 * **The reach is what the scenario is about, and the column is settled now.**
 * A case is stamped with the install's default customer when it is opened,
 * rather than carrying nothing and resolving to whichever customer is default
 * when it is read.
 *
 * **Because a reference is unique within its customer, and a group that moves
 * is not a group.** Cases that follow the default are re-grouped the moment an
 * operator makes a different record the default -- which can make two cases
 * collide on a reference neither has changed, or free a collision nobody
 * resolved. A rule the database enforces has to be asked of a value the row
 * holds. -> #220
 *
 * **The analyst is in no group**, which is what makes *every analyst* the
 * claim rather than *the analyst who happened to be granted something*.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { cases } from '../src/db/schema/case.js'
import { customers } from '../src/db/schema/customer.js'
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

  it('is stamped with the install default, not left to follow it', async () => {
    const db = drizzle({ client: pool! })
    const [row] = await db
      .select({ customerId: cases.customerId })
      .from(cases)
      .where(eq(cases.id, caseId))
    const [fallback] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.isDefault, true))

    expect(row, 'the case was not created at all').toBeDefined()
    expect(fallback, 'the install holds no default customer').toBeDefined()
    expect(
      row!.customerId,
      'the case was not stamped, so what the guard resolves is what decides its group',
    ).toBe(fallback!.id)
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

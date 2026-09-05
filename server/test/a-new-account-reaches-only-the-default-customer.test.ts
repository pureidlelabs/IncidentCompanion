/**
 * An account an administrator just made can sign in, and reaches almost nothing.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { cases } from '../src/db/schema/case.js'
import { customers } from '../src/db/schema/customer.js'
import { openTestPool } from './database.js'

const PASSWORD = 'a-password-long-enough-to-pass'
/** What the holder picks for themselves, which is what lifts the hold. */
const CHOSEN = 'the-password-they-chose-themselves'
const NEW_ACCOUNT = `provisioned-${String(Date.now())}@example.test`

let harness: Harness | null = null
let admin: Persona
let newcomer: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let theirCase = ''
let defaultCase = ''

const status = async (cookie: string, caseId: string) =>
  (await fetch(`${harness!.base}/api/cases/${caseId}`, { headers: { cookie } })).status

describe.skipIf(!(await bootable()))('an account just provisioned', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: NEW_ACCOUNT,
        displayName: 'A Provisioned Analyst',
        password: PASSWORD,
        role: 'analyst',
      }),
    })
    expect(made.status, `creating the account answered ${await made.text()}`).toBe(201)

    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    const db = drizzle({ client: pool })

    const [theirs] = await db
      .insert(customers)
      .values({ name: `Somebody else ${String(Date.now())}` })
      .returning({ id: customers.id })
    const [fallback] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.isDefault, true))
      .limit(1)
    expect(fallback, 'this install has no default customer, so the second half is unreachable').toBeDefined()

    const [one] = await db
      .insert(cases)
      .values({ title: 'On a customer they do not reach', customerId: theirs!.id })
      .returning({ id: cases.id })
    theirCase = one!.id
    const [two] = await db
      .insert(cases)
      .values({ title: 'On the default customer', customerId: fallback!.id })
      .returning({ id: cases.id })
    defaultCase = two!.id
  }, 90_000)

  afterAll(async () => {
    const db = drizzle({ client: pool! })
    await db.delete(cases).where(eq(cases.id, theirCase))
    await db.delete(cases).where(eq(cases.id, defaultCase))
    await pool?.end()
    await harness?.close()
  })

  it('can sign in', async () => {
    newcomer = await signIn(harness!, NEW_ACCOUNT, PASSWORD)
    expect(newcomer.cookie, 'the new account signed in without a session').toContain('session_token')
    expect(newcomer.role, 'a provisioned account was made an administrator').toBe('analyst')
  })

  /**
   * **A provisioned account reaches nothing at all until it sets its own
   * password**, which is not the reach model refusing: every route answers `403
   * {"mustChangePassword":true}` while the administrator's chosen password
   * stands.
   */
  it('is refused everything until it sets its own password, and then is not', async () => {
    const before = await fetch(`${harness!.base}/api/cases/${defaultCase}`, {
      headers: { cookie: newcomer.cookie },
    })
    expect(before.status).toBe(403)
    expect((await before.json()) as { mustChangePassword?: boolean }).toMatchObject({
      mustChangePassword: true,
    })

    /**
     * **`/api/change-password`, not Better Auth's `/api/auth/change-password`.**
     */
    const changed = await fetch(`${harness!.base}/api/change-password`, {
      method: 'POST',
      headers: { cookie: newcomer.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ current: PASSWORD, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(changed.status, `changing the password answered ${await changed.text()}`).toBe(200)

    newcomer = await signIn(harness!, NEW_ACCOUNT, CHOSEN)
  })

  it('reaches a case on the default customer, which everybody holds', async () => {
    expect(
      await status(newcomer.cookie, defaultCase),
      'the account reaches nothing at all, so the refusal below is not about groups',
    ).toBe(200)
  })

  it('reaches no case on a customer no group of theirs holds', async () => {
    expect(
      await status(newcomer.cookie, theirCase),
      'an account in no group reached a case belonging to another customer',
    ).not.toBe(200)
  })
})

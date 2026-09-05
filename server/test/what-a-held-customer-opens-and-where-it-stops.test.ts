/**
 * Holding a customer opens its cases and what hangs off them, and no further.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { GroupsService } from '../src/access/groups.service.js'
import { cases } from '../src/db/schema/case.js'
import { customers } from '../src/db/schema/customer.js'
import { groupCustomers, groupMembers, groups } from '../src/db/schema/groups.js'
import { openTestPool } from './database.js'

const PASSWORD = 'a-password-long-enough-to-pass'
const CHOSEN = 'the-password-they-chose-themselves'
const ANALYST = `holds-customer-${String(Date.now())}@example.test`

let harness: Harness | null = null
let admin: Persona
let analyst: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let appPool: ReturnType<typeof openTestPool> | null = null
let caseId = ''
let customerId = ''
let sector = ''

const get = async (path: string) =>
  (await fetch(`${harness!.base}${path}`, { headers: { cookie: analyst.cookie } })).status

describe.skipIf(!(await bootable()))('an analyst who holds the customer a case belongs to', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: ANALYST,
        displayName: 'Holds The Customer',
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
      .values({ name: `Held ${String(Date.now())}` })
      .returning({ id: customers.id })
    customerId = customer!.id
    const [group] = await db
      .insert(groups)
      .values({ name: `Holders ${String(Date.now())}` })
      .returning({ id: groups.id })
    sector = group!.id
    await db.insert(groupCustomers).values({ groupId: sector, customerId })

    const [one] = await db
      .insert(cases)
      .values({ title: 'A case on a customer they hold', customerId })
      .returning({ id: cases.id })
    caseId = one!.id

    // Granted through the app's own service, at `read` and no more. The grant
    // runs as `ic_app` because that is the role the service holds in the app.
    appPool = openTestPool(process.env['DATABASE_URL']!, 'ic_app')
    await new GroupsService(drizzle({ client: appPool })).grant(sector, analyst.id, 'read')
  }, 90_000)

  afterAll(async () => {
    const db = drizzle({ client: pool! })
    await db.delete(cases).where(eq(cases.id, caseId))
    await db.delete(groupMembers).where(eq(groupMembers.groupId, sector))
    await db.delete(groupCustomers).where(eq(groupCustomers.groupId, sector))
    await db.delete(groups).where(eq(groups.id, sector))
    await db.delete(customers).where(eq(customers.id, customerId))
    await pool?.end()
    await appPool?.end()
    await harness?.close()
  })

  it('is served the case itself', async () => {
    expect(await get(`/api/cases/${caseId}`), 'the grant did not open the case').toBe(200)
  })

  it('is served what hangs off it, on the same grant', async () => {
    expect(
      await get(`/api/cases/${caseId}/timeline`),
      'the case opens and a collection under it does not, so reach is not decided in one ' +
        'place',
    ).toBe(200)
  })

  it('is refused a write, because the level is read', async () => {
    const answer = await fetch(`${harness!.base}/api/cases/${caseId}`, {
      method: 'PATCH',
      headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ version: 1, title: 'Renamed by somebody at read' }),
    })
    expect(
      answer.status,
      'an analyst at read changed the case, so the level permits everything it reaches',
    ).toBe(403)
  })
})

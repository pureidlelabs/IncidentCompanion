/**
 * An identity the install does not hold reaches nothing, the default customer
 * included.
 *
 * > Every account reaches it.
 *
 * **The floor is an account's, not a session's.** A session can outlive the
 * account it was issued to -- the copy in the ephemeral store is served after
 * the row is gone -- and the default customer's floor granted write to
 * whatever id arrived. This deletes the account under a live session and asks
 * for a case every account reaches.
 */
import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { ReachService } from '../src/access/reach.service.js'
import { cases, user } from '../src/db/schema/index.js'

const ISSUED = 'a-password-long-enough-to-pass'
const CHOSEN = 'the-password-they-chose-themselves'
const EMAIL = `gone-${String(process.pid)}-${String(Date.now())}@example.invalid`

let harness: Harness
let ghost: Persona
let seedPool: ReturnType<typeof openTestPool>
let everyones = ''

describe.skipIf(!(await bootable()))('an identity the install does not hold', () => {
  beforeAll(async () => {
    harness = await boot()
    const admin = await sharedAdmin(harness)
    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: EMAIL,
        displayName: 'Gone',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
    const held = await signIn(harness, EMAIL, ISSUED)
    const lifted = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { cookie: held.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ current: ISSUED, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(lifted.status).toBe(200)
    ghost = await signIn(harness, EMAIL, CHOSEN)

    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')
    const [made2] = await drizzle({ client: seedPool })
      .insert(cases)
      .values({ title: 'Everybody reaches this one' })
      .returning({ id: cases.id })
    everyones = made2!.id

    // The premise: the live account reaches a default-customer case.
    const before = await fetch(`${harness.base}/api/cases/${everyones}`, {
      headers: { cookie: ghost.cookie },
    })
    expect(before.status, 'the account could not reach the default customer to begin with').toBe(
      200,
    )

    await drizzle({ client: seedPool }).delete(user).where(eq(user.id, ghost.id))
  }, 90_000)

  afterAll(async () => {
    await drizzle({ client: seedPool }).delete(cases).where(eq(cases.id, everyones))
    await seedPool?.end()
    await harness?.close()
  })

  it('is given no level over the default customer, and no case in it', async () => {
    const reach = harness.app.get(ReachService)
    const nobody = randomUUID()
    const fallback = await reach.defaultCustomerId()

    expect(await reach.levelFor(nobody, fallback!)).toBeNull()
    expect(await reach.levelOnCase(nobody, everyones)).toEqual({
      customerId: fallback,
      level: null,
    })
  })

  it('is refused a default-customer case over a session that outlived its account', async () => {
    const read = await fetch(`${harness.base}/api/cases/${everyones}`, {
      headers: { cookie: ghost.cookie },
    })
    const listed = await fetch(`${harness.base}/api/cases`, { headers: { cookie: ghost.cookie } })
    const listing = listed.ok ? ((await listed.json()) as { id: string }[]) : []

    expect(read.status, 'a session whose account is gone read a case').not.toBe(200)
    expect(
      listing.map((one) => one.id),
      'a session whose account is gone was listed a case',
    ).not.toContain(everyones)
  })
})

/**
 * Moving a case to another customer moves who can reach it.
 *
 * Two scenarios of *Reaching a case is decided in one place, by customer*,
 * both `unbuilt` until now because no route moved a case:
 *
 * *An unknown customer becomes known* -- the case gains that customer, and
 * reach follows the new customer from that moment.
 *
 * *A case's customer changes under an analyst* -- an analyst who reaches the
 * customer it left and not the one it went to can no longer reach it.
 *
 * **Driven through the endpoints, because the property is what a caller
 * receives.** The guard computing the right answer and the route not carrying
 * it are the same thing from outside, and the reach half is exactly what a
 * test against the service could not see.
 *
 * **The analyst does the moving.** An analyst working a case is who learns
 * whose incident it is, and `write` on the customer it has now is the level
 * the route asks for -- so this also demonstrates that the ordinary use does
 * not need an administrator.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { GroupsService } from '../src/access/groups.service.js'
import { cases } from '../src/db/schema/case.js'
import { customers } from '../src/db/schema/customer.js'
import { groupCustomers, groupMembers, groups } from '../src/db/schema/groups.js'
import { installActivity } from '../src/db/schema/install-activity.js'
import { openTestPool } from './database.js'

const ISSUED = 'a-password-long-enough-to-pass'
const CHOSEN = 'the-password-they-chose-themselves'
const ANALYST = `moves-a-case-${String(Date.now())}@example.test`

let harness: Harness | null = null
let analyst: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let appPool: ReturnType<typeof openTestPool> | null = null
let caseId = ''
let leaves = ''
let arrives = ''
let sector = ''
let elsewhere = ''

const asAnalyst = (path: string, init: RequestInit = {}) =>
  fetch(`${harness!.base}${path}`, {
    ...init,
    headers: { cookie: analyst.cookie, ...(init.headers ?? {}) },
  })

describe.skipIf(!(await bootable()))('a case moved to another customer', () => {
  beforeAll(async () => {
    harness = await boot()
    const admin = await sharedAdmin(harness)

    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: ANALYST,
        displayName: 'Moves A Case',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    expect(made.status, `creating the account answered ${await made.text()}`).toBe(201)

    analyst = await signIn(harness, ANALYST, ISSUED)
    const lifted = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ current: ISSUED, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(lifted.status, 'the password hold was not lifted, so every route refuses').toBe(200)
    analyst = await signIn(harness, ANALYST, CHOSEN)

    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    const db = drizzle({ client: pool })

    const stamp = String(Date.now())
    const [from] = await db
      .insert(customers)
      .values({ name: `Leaves ${stamp}` })
      .returning({ id: customers.id })
    leaves = from!.id
    const [to] = await db
      .insert(customers)
      .values({ name: `Arrives ${stamp}` })
      .returning({ id: customers.id })
    arrives = to!.id

    // The group the analyst is in holds only the customer the case starts on.
    const [group] = await db
      .insert(groups)
      .values({ name: `Movers ${stamp}` })
      .returning({ id: groups.id })
    sector = group!.id
    await db.insert(groupCustomers).values({ groupId: sector, customerId: leaves })

    // A second group, holding the destination and nobody in it yet: the
    // analyst is put in it at the end, to show reach following the case.
    const [other] = await db
      .insert(groups)
      .values({ name: `Receivers ${stamp}` })
      .returning({ id: groups.id })
    elsewhere = other!.id
    await db.insert(groupCustomers).values({ groupId: elsewhere, customerId: arrives })

    const [one] = await db
      .insert(cases)
      .values({ title: `Whose incident is this ${stamp}`, customerId: leaves })
      .returning({ id: cases.id })
    caseId = one!.id

    appPool = openTestPool(process.env['DATABASE_URL']!, 'ic_app')
    await new GroupsService(drizzle({ client: appPool })).grant(sector, analyst.id, 'write')
  }, 90_000)

  afterAll(async () => {
    const db = drizzle({ client: pool! })
    await db.delete(cases).where(eq(cases.id, caseId))
    await db.delete(groupMembers).where(eq(groupMembers.groupId, sector))
    await db.delete(groupMembers).where(eq(groupMembers.groupId, elsewhere))
    await db.delete(groupCustomers).where(eq(groupCustomers.groupId, sector))
    await db.delete(groupCustomers).where(eq(groupCustomers.groupId, elsewhere))
    await db.delete(groups).where(eq(groups.id, sector))
    await db.delete(groups).where(eq(groups.id, elsewhere))
    await db.delete(customers).where(eq(customers.id, leaves))
    await db.delete(customers).where(eq(customers.id, arrives))
    await pool?.end()
    await appPool?.end()
    await harness?.close()
  })

  /** The premise. A case they could not reach to begin with proves nothing. */
  it('starts reachable by the analyst who holds the customer it is on', async () => {
    expect((await asAnalyst(`/api/cases/${caseId}`)).status).toBe(200)
  })

  it('is moved by that analyst, who needs no administrator', async () => {
    const moved = await asAnalyst(`/api/cases/${caseId}/customer`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerId: arrives }),
    })

    expect(moved.status, `moving the case answered ${await moved.clone().text()}`).toBe(200)
    expect(await moved.json()).toMatchObject({ done: true, from: leaves })
  })

  /**
   * *THEN the analyst can no longer reach it.*
   *
   * **404 rather than 403**, which is the requirement beside this one: out of
   * reach and not there are answered identically, so a refusal never confirms
   * that somebody else's case exists.
   */
  it('is out of reach for the analyst who moved it, the moment it lands', async () => {
    expect(
      (await asAnalyst(`/api/cases/${caseId}`)).status,
      'the analyst still reaches a case for a customer they do not hold',
    ).toBe(404)
  })

  /** And what hangs off it, or reach is not decided in one place. */
  it('takes what hangs off it out of reach too', async () => {
    expect((await asAnalyst(`/api/cases/${caseId}/timeline`)).status).toBe(404)
  })

  /**
   * *AND anything they had open on it stops being served*, which is the clause
   * only a socket can answer.
   *
   * **The connection is ended rather than re-checked in place.** A socket that
   * revalidated its own reach would be a second copy of the reach rules kept in
   * step by hand; ending it makes the client reconnect, and the upgrade asks
   * the guard the same question. That is the answer `onReachChanged` already
   * gives a revoked analyst.
   */
  it('ends a connection the analyst had open on it', async () => {
    const db = drizzle({ client: pool! })
    const [opened] = await db
      .insert(cases)
      .values({ title: `Moved under a socket ${String(Date.now())}`, customerId: leaves })
      .returning({ id: cases.id })
    const id = opened!.id

    const socket = new WebSocket(`${harness!.base.replace('http://', 'ws://')}/api/cases/${id}/live`, {
      headers: { cookie: analyst.cookie, origin: harness!.base },
    })
    try {
      await new Promise<void>((resolve, reject) => {
        socket.on('open', () => {
          resolve()
        })
        socket.on('error', reject)
      })

      const moved = await asAnalyst(`/api/cases/${id}/customer`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId: arrives }),
      })
      expect(moved.ok, `moving the case answered ${String(moved.status)}`).toBe(true)

      const closed = await new Promise<boolean>((resolve) => {
        if (socket.readyState === socket.CLOSED) return resolve(true)
        const giveUp = setTimeout(() => {
          resolve(false)
        }, 8000)
        socket.once('close', () => {
          clearTimeout(giveUp)
          resolve(true)
        })
      })
      expect(closed, 'the socket outlived the reach that opened it').toBe(true)
    } finally {
      socket.terminate()
      await db.delete(cases).where(eq(cases.id, id))
    }
  }, 40_000)

  /**
   * *AND reach follows the new customer from that moment.* Put in a group
   * holding the customer the case went to, the same analyst reaches it again
   * -- without the case being touched a second time.
   */
  it('is reachable again through the customer it went to', async () => {
    await new GroupsService(drizzle({ client: appPool! })).grant(elsewhere, analyst.id, 'read')

    expect(
      (await asAnalyst(`/api/cases/${caseId}`)).status,
      'reach did not follow the case to its new customer',
    ).toBe(200)
  })

  /**
   * *An unknown customer becomes known*, given the organisation once somebody
   * works out whose incident it was.
   *
   * **Both shapes of "standing against the default", because they are two
   * states and not one.** The specification says a case is created against the
   * default customer; the code creates it against nothing and every reader
   * resolves the absence to the default. That disagreement is #131, and while
   * it is open a test that exercised only one of them would be citing this
   * scenario on a state the other half of the product does not produce.
   *
   * **A case that named nobody reports `from: null` and is logged as `none`**,
   * rather than omitting the key -- an absent `from` reads as a line that
   * forgot to record it.
   */
  it.each([
    ['naming nobody', null],
    ['naming the default customer', 'default'],
  ] as const)('gives a case %s its organisation', async (_shape, standing) => {
    const db = drizzle({ client: pool! })
    const [fallback] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.isDefault, true))
    const against = standing === 'default' ? fallback!.id : null

    const [opened] = await db
      .insert(cases)
      .values({
        title: `Origin not yet known ${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
        ...(against ? { customerId: against } : {}),
      })
      .returning({ id: cases.id })
    const id = opened!.id

    try {
      const given = await asAnalyst(`/api/cases/${id}/customer`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId: arrives }),
      })
      expect(given.status, `attributing answered ${await given.clone().text()}`).toBe(200)
      expect(await given.json()).toMatchObject({ done: true, from: against })

      const found = await db
        .select()
        .from(installActivity)
        .where(eq(installActivity.event, 'case_attributed'))
      const ours = found.filter((one) => (one.detail as { caseId?: string })?.caseId === id)
      expect(ours[0]!.detail).toMatchObject({ from: against ?? 'none', to: arrives })
    } finally {
      await db.delete(cases).where(eq(cases.id, id))
    }
  })


  /** *AND the move is an attributed change.* */
  it('leaves a line naming both customers and who moved it', async () => {
    const db = drizzle({ client: pool! })
    const found = await db
      .select()
      .from(installActivity)
      .where(eq(installActivity.event, 'case_attributed'))

    const ours = found.filter((one) => (one.detail as { caseId?: string })?.caseId === caseId)
    expect(ours, 'the move left no record at all').toHaveLength(1)
    expect(ours[0]!.actorId, 'the line does not say who moved it').toBe(analyst.id)
    expect(ours[0]!.detail).toMatchObject({ from: leaves, to: arrives })
  })
})

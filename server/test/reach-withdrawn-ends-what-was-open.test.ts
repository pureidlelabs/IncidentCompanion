/**
 * An analyst whose reach is taken away stops being served the case, and the
 * connection they already had open ends.
 *
 * **Both ways the event happens.** The scenario names a revocation *or the
 * customer leaving the group*, and they are different code: the first
 * announces the analyst directly, the second announces everybody still in the
 * group. One working says nothing about the other, so each has its own case.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { WebSocket } from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { user } from '../src/db/schema/auth.js'
import { cases } from '../src/db/schema/case.js'
import { customers } from '../src/db/schema/customer.js'
import { openTestPool } from './database.js'

const ISSUED = 'a-password-long-enough-to-pass'
const CHOSEN = 'the-password-the-analyst-chose'
const EMAIL = `reach-withdrawn-${String(process.pid)}@harness.test`

let harness: Harness | null = null
let admin: Persona
let analyst: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let caseId = ''
let customerId = ''
let groupId = ''
let analystId = ''
let wsBase = ''

const opened: WebSocket[] = []

const waitFor = async (ready: () => boolean, ms: number): Promise<boolean> => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (ready()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return ready()
}

const socketOn = async (cookie: string) => {
  const socket = new WebSocket(`${wsBase}/api/cases/${caseId}/live`, {
    headers: { cookie, origin: harness!.base },
  })
  opened.push(socket)
  const up = await new Promise<boolean>((resolve) => {
    socket.on('open', () => {
      resolve(true)
    })
    socket.on('error', () => {
      resolve(false)
    })
  })
  return { socket, up }
}

describe.skipIf(!(await bootable()))('an analyst whose reach is taken away', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    wsBase = harness.base.replace('http://', 'ws://')
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    const db = drizzle({ client: pool })

    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: EMAIL,
        displayName: 'Reach Withdrawn',
        password: ISSUED,
      }),
    })
    const madeSaid = await made.text()
    expect(made.ok, `the account was refused: ${madeSaid}`).toBe(true)

    // The create route answers with a receipt rather than the row, and the
    // group routes name an analyst by id.
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, EMAIL))
    analystId = row!.id

    const held = await signIn(harness, EMAIL, ISSUED)
    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: held.cookie },
      body: JSON.stringify({ current: ISSUED, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(changed.ok, 'the analyst could not set their own password').toBe(true)
    analyst = await signIn(harness, EMAIL, CHOSEN)

    const [customer] = await db
      .insert(customers)
      .values({ name: `Reach Withdrawn Customer ${String(process.pid)}` })
      .returning({ id: customers.id })
    customerId = customer!.id

    const [kase] = await db
      .insert(cases)
      .values({ title: 'A case the analyst is working', customerId })
      .returning({ id: cases.id })
    caseId = kase!.id

    const group = await fetch(`${harness.base}/api/groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ name: `Reach Withdrawn Group ${String(process.pid)}` }),
    })
    const groupSaid = await group.text()
    expect(group.ok, `the group was refused: ${groupSaid}`).toBe(true)
    groupId = (JSON.parse(groupSaid) as { id: string }).id

    for (const [path, body] of [
      [`/api/groups/${groupId}/customers`, { customerId }],
      [`/api/groups/${groupId}/members`, { userId: analystId, level: 'read' }],
    ] as const) {
      const answer = await fetch(`${harness.base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify(body),
      })
      const said = await answer.text()
      expect(answer.ok, `${path} was refused: ${said}`).toBe(true)
    }
  }, 120_000)

  afterAll(async () => {
    for (const socket of opened) socket.terminate()
    if (pool && caseId !== '') {
      const db = drizzle({ client: pool })
      await db.delete(cases).where(eq(cases.id, caseId))
      await db.delete(customers).where(eq(customers.id, customerId))
    }
    await pool?.end()
    await harness?.close()
  })

  it('is served the case while the group reaches it', async () => {
    const answer = await fetch(`${harness!.base}/api/cases/${caseId}`, {
      headers: { cookie: analyst.cookie },
    })

    expect(
      answer.status,
      'the grant does not reach the case, so withdrawing it takes nothing away',
    ).toBe(200)
  })

  it('ends the connection it already had open', async () => {
    const { socket, up } = await socketOn(analyst.cookie)
    expect(up, 'the socket never opened, so its closing would say nothing').toBe(true)

    const revoked = await fetch(`${harness!.base}/api/groups/${groupId}/members/${analystId}`, {
      method: 'DELETE',
      headers: { cookie: admin.cookie },
    })
    const revokedSaid = await revoked.text()
    expect(revoked.ok, `the revocation was refused: ${revokedSaid}`).toBe(true)

    expect(
      await waitFor(() => socket.readyState === socket.CLOSED, 8000),
      'the analyst is still connected to a case they no longer reach, so what they had open ' +
        'goes on updating after the reach that opened it was taken away',
    ).toBe(true)
  }, 40_000)

  it('stops serving the case at all', async () => {
    const answer = await fetch(`${harness!.base}/api/cases/${caseId}`, {
      headers: { cookie: analyst.cookie },
    })

    expect(
      answer.status,
      'the case is still served to an analyst whose reach was withdrawn',
    ).not.toBe(200)
  })

  it('refuses a fresh connection as well', async () => {
    const { up } = await socketOn(analyst.cookie)

    expect(up, 'a new socket opened on a case the analyst no longer reaches').toBe(false)
  }, 40_000)

  /**
   * **The other way the same event happens.** The scenario names both -- *the
   * group that reached it is revoked, or the customer leaves it* -- and they
   * are different code: a revocation announces the analyst directly, while a
   * customer leaving announces everybody still in the group. To the analyst
   * they are one event, so one of them working says nothing about the other.
   */
  it('ends the connection when the customer leaves the group instead', async () => {
    const regranted = await fetch(`${harness!.base}/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ userId: analystId, level: 'read' }),
    })
    const regrantedSaid = await regranted.text()
    expect(regranted.ok, `the membership was not restored: ${regrantedSaid}`).toBe(true)

    const { socket, up } = await socketOn(analyst.cookie)
    expect(up, 'the restored grant did not reach the case, so nothing is being taken away').toBe(
      true,
    )

    const released = await fetch(`${harness!.base}/api/groups/${groupId}/customers/${customerId}`, {
      method: 'DELETE',
      headers: { cookie: admin.cookie },
    })
    const releasedSaid = await released.text()
    expect(released.ok, `the customer was not released: ${releasedSaid}`).toBe(true)

    expect(
      await waitFor(() => socket.readyState === socket.CLOSED, 8000),
      'the customer left the group and the analyst is still connected to its case, so the ' +
        'half of this scenario that announces every member does not reach an open socket',
    ).toBe(true)
  }, 60_000)
})

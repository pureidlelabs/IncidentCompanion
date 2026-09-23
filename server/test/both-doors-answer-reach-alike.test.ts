/**
 * A route and the case socket answer reach alike, at every level.
 *
 * > Whether a caller may reach something MUST be decided once, never re-decided
 * > by each thing that serves it.
 *
 * **Both doors ask the one decision**, so this is the guard against a second
 * copy growing back: an analyst is given each level over a customer in turn,
 * and at each one the route and the socket are asked the same two questions --
 * may this analyst see the case, and may they change it. A door answering
 * differently is a copy of the rules that drifted.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { cases, customers, groupCustomers, groupMembers, groups } from '../src/db/schema/index.js'

const TAG = `${String(process.pid)}-${String(Date.now())}`
const ISSUED = 'a-password-long-enough-to-pass'
const CHOSEN = 'the-password-they-chose-themselves'

let harness: Harness
let analyst: Persona
let seedPool: ReturnType<typeof openTestPool>
let customer = ''
let group = ''
let theirs = ''
let everyones = ''

const seed = () => drizzle({ client: seedPool })

/** What the route says: whether it serves the case, and whether a write gets past reach. */
async function theRoute(caseId: string): Promise<{ sees: boolean; writes: boolean }> {
  const read = await fetch(`${harness.base}/api/cases/${caseId}`, {
    headers: { cookie: analyst.cookie },
  })
  // A stale version, so a write reach admits is refused by the version rather than made.
  const write = await fetch(`${harness.base}/api/cases/${caseId}`, {
    method: 'PATCH',
    headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ version: -1, title: 'never written' }),
  })
  return { sees: read.status === 200, writes: ![403, 404].includes(write.status) }
}

/** What the socket says: whether it admits a connection, and whether it takes a claim. */
async function theSocket(caseId: string): Promise<{ sees: boolean; writes: boolean }> {
  const socket = new WebSocket(
    `${harness.base.replace('http://', 'ws://')}/api/cases/${caseId}/live`,
    {
      headers: { cookie: analyst.cookie, origin: harness.base },
    },
  )
  socket.on('error', () => undefined)
  const heard: { type?: string; claims?: { entry_id?: string }[] }[] = []
  socket.on('message', (raw: Buffer) =>
    heard.push(JSON.parse(raw.toString()) as (typeof heard)[number]),
  )
  const admitted = await new Promise<boolean>((settle) => {
    socket.once('open', () => settle(true))
    socket.once('unexpected-response', () => settle(false))
  })
  if (!admitted) return { sees: false, writes: false }

  // After the join's first frame: a frame sent sooner reaches no listener yet.
  const joinedBy = Date.now() + 5000
  while (!heard.some((frame) => frame.type === 'presence') && Date.now() < joinedBy) {
    await new Promise((wake) => setTimeout(wake, 25))
  }
  const row = crypto.randomUUID()
  socket.send(JSON.stringify({ type: 'claim', table: 'systems', id: row }))
  const deadline = Date.now() + 5000
  let writes: boolean | null = null
  while (writes === null && Date.now() < deadline) {
    if (heard.some((frame) => frame.type === 'claim.refused')) writes = false
    else if (
      heard.some(
        (frame) => frame.type === 'presence' && frame.claims?.some((one) => one.entry_id === row),
      )
    ) {
      writes = true
    } else await new Promise((wake) => setTimeout(wake, 25))
  }
  socket.terminate()
  expect(writes, 'the socket neither took nor refused the claim').not.toBeNull()
  return { sees: true, writes: writes! }
}

describe.skipIf(!(await bootable()))('the route and the socket, at each level', () => {
  beforeAll(async () => {
    harness = await boot()
    const admin = await sharedAdmin(harness)
    const email = `both-doors-${TAG}@example.invalid`
    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: email,
        displayName: 'Both Doors',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
    const held = await signIn(harness, email, ISSUED)
    const lifted = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { cookie: held.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ current: ISSUED, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(lifted.status).toBe(200)
    analyst = await signIn(harness, email, CHOSEN)

    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')
    const [c] = await seed()
      .insert(customers)
      .values({ name: `Both doors ${TAG}` })
      .returning()
    customer = c!.id
    const [g] = await seed()
      .insert(groups)
      .values({ name: `Both doors ${TAG}` })
      .returning()
    group = g!.id
    await seed().insert(groupCustomers).values({ groupId: group, customerId: customer })
    const [one] = await seed()
      .insert(cases)
      .values({ title: 'Theirs', customerId: customer })
      .returning()
    const [two] = await seed().insert(cases).values({ title: 'For everyone' }).returning()
    theirs = one!.id
    everyones = two!.id
  }, 90_000)

  afterAll(async () => {
    await seed().delete(cases).where(eq(cases.id, theirs))
    await seed().delete(cases).where(eq(cases.id, everyones))
    await seed().delete(groups).where(eq(groups.id, group))
    await seed().delete(customers).where(eq(customers.id, customer))
    await seedPool?.end()
    await harness?.close()
  })

  it.each([
    ['none', { sees: false, writes: false }],
    ['read', { sees: true, writes: false }],
    ['write', { sees: true, writes: true }],
    ['delete', { sees: true, writes: true }],
  ] as const)(
    'answers alike at %s over an attributed case',
    async (level, expected) => {
      await seed().delete(groupMembers).where(eq(groupMembers.groupId, group))
      if (level !== 'none') {
        await seed().insert(groupMembers).values({ groupId: group, userId: analyst.id, level })
      }

      const route = await theRoute(theirs)
      const socket = await theSocket(theirs)

      expect(route, 'the route answered this level wrongly').toEqual(expected)
      expect(socket, 'the socket answered the level differently from the route').toEqual(route)
    },
    30_000,
  )

  it('answers alike over a case nobody has attributed, which every analyst writes', async () => {
    const route = await theRoute(everyones)
    const socket = await theSocket(everyones)

    expect(route).toEqual({ sees: true, writes: true })
    expect(socket).toEqual(route)
  }, 30_000)
})

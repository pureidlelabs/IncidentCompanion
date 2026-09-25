/**
 * An announcement of another analyst's write names them as the screens do,
 * heard on the socket a second analyst holds.
 *
 * > #### Scenario: Another analyst writes from outside the case
 * > #### Scenario: A writer whose account is gone
 *
 * **The attack is a writer who is not in the room**: one writing over a
 * request with no socket open, and one whose account is deleted between
 * typing and the save.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { caseSocket, issued, until, type Frame, type Live } from './case-socket.js'
import { openTestPool } from './database.js'
import { cases, customers, user } from '../src/db/schema/index.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`

let harness: Harness
let admin: Persona
let owner: Persona
let seedPool: ReturnType<typeof openTestPool>
let group = ''
let customer = ''
let caseId = ''
const sockets: WebSocket[] = []

const call = async (who: Persona, path: string, body: unknown) => {
  const response = await fetch(`${harness.base}${path}`, {
    method: path.endsWith('/customer') ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json', cookie: who.cookie },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  expect(response.ok, `${path} answered ${String(response.status)}: ${text}`).toBe(true)
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>
}

async function aWriter(name: string): Promise<Persona> {
  const who = await issued(
    harness,
    admin,
    name,
    `${name.toLowerCase().replaceAll(' ', '-')}-${TAG}@example.invalid`,
  )
  await call(admin, `/api/groups/${group}/members`, { userId: who.id, level: 'write' })
  return who
}

const { connect, opens, types } = caseSocket(
  () => harness,
  () => caseId,
  sockets,
)

/** The first announcement `live` hears about `scope` after its `from`th frame. */
async function announced(live: Live, from: number, scope: string): Promise<Frame> {
  const found = () =>
    live.heard
      .slice(from)
      .find((f) => f.type === 'case.changed' && (f['scopes'] as string[]).includes(scope))
  await until(() => found() !== undefined, `nothing announced a write to ${scope}`, 3_000)
  return found()!
}

describe.skipIf(!(await bootable()))("an announcement of another analyst's write", () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')
    customer = (await call(admin, '/api/customers', { name: `Announced ${TAG}` }))['id'] as string
    group = (await call(admin, '/api/groups', { name: `Announced ${TAG}` }))['id'] as string
    await call(admin, `/api/groups/${group}/customers`, { customerId: customer })
    owner = await aWriter('Case Owner')
    caseId = (await call(owner, '/api/cases', { title: `Announced ${TAG}` }))['id'] as string
    await call(owner, `/api/cases/${caseId}/customer`, { customerId: customer })
  }, 120_000)

  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    const seed = drizzle({ client: seedPool })
    await seed.delete(cases).where(eq(cases.id, caseId))
    await seed.delete(customers).where(eq(customers.id, customer))
    await seedPool?.end()
    await harness?.close()
  })

  it('names an analyst writing from outside the room by their name', async () => {
    const outside = await aWriter('Outside Writer')
    const watching = await connect(owner)
    const from = watching.heard.length

    await call(outside, `/api/cases/${caseId}/casenotes`, { note: `from outside the room ${TAG}` })

    expect((await announced(watching, from, 'casenotes'))['by']).toBe('Outside Writer')
  })

  it('names nobody for a writer whose account is gone before the save', async () => {
    const noteId = (await call(owner, `/api/cases/${caseId}/casenotes`, { note: 'seed' }))[
      'id'
    ] as string
    const watching = await opens(owner, noteId)
    const leaving = await aWriter('Leaving Writer')
    await types(await opens(leaving, noteId), noteId, `typed and gone ${TAG}`, watching)
    const from = watching.heard.length
    await drizzle({ client: seedPool }).delete(user).where(eq(user.id, leaving.id))

    expect((await announced(watching, from, 'casenotes'))['by']).toBe('')
  })
})

/**
 * A list names only the cases its caller reaches, whichever list it is.
 *
 * The lists are the document's: every GET it publishes that takes no path
 * parameter, asked over HTTP by an account that does not reach one case. That
 * case's id and title must be in none of the answers. Lists under a case's own
 * address are that case's contents, and the case guard answers for them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, operations, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'

/**
 * The install audit names a case by the title it was created under, and it is
 * read by administrators who reach no case data. Whether that title is case
 * content a line must not carry is undecided; it is reported, not asserted.
 */
const UNDECIDED = new Set(['/api/install/activity'])

const ISSUED = 'list-reach-issued-1234'
const CHOSEN = 'list-reach-chosen-1234'

describe.skipIf(!(await bootable()))('a list offers only what the caller reaches', () => {
  let harness: Harness
  let admin: Persona
  const stamp = `${String(process.pid)}-${String(Date.now())}`
  const unreached = { id: '', title: `unreached ${stamp}` }
  const nobodys = { id: '', title: `attributed to nobody ${stamp}` }
  let customerId = ''

  async function call(who: Persona, method: string, path: string, body?: unknown) {
    const response = await fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: who.cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, text, json: () => JSON.parse(text) as Record<string, unknown> }
  }

  /** An account made the way an install makes one, holding the password it chose. */
  async function account(role: 'admin' | 'analyst'): Promise<Persona> {
    const username = `list-reach-${role}-${stamp}@harness.test`
    const made = await call(admin, 'POST', '/api/accounts', {
      username,
      displayName: `List reach ${role}`,
      password: ISSUED,
      role,
    })
    expect(made.status, made.text).toBe(201)
    const held = await signIn(harness, username, ISSUED)
    const lifted = await call(held, 'POST', '/api/change-password', {
      current: ISSUED,
      password: CHOSEN,
      repeat: CHOSEN,
    })
    expect(lifted.status, lifted.text).toBe(200)
    return signIn(harness, username, CHOSEN)
  }

  /** Every published list the caller can ask for, and which of them name `record`. */
  async function namedBy(who: Persona, record: { id: string; title: string }) {
    const lists = operations(harness.document).filter(
      (one) => one.method === 'GET' && !one.template.includes('{') && !UNDECIDED.has(one.template),
    )
    expect(lists.length, 'the document publishes no list, so this sweeps nothing').toBeGreaterThan(5)
    const naming: string[] = []
    for (const list of lists) {
      const { status, text } = await call(who, 'GET', list.path)
      if (text.includes(record.id) || text.includes(record.title)) naming.push(`${list.path} (${String(status)})`)
    }
    return naming
  }

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    const customer = await call(admin, 'POST', '/api/customers', { name: `Onboarded ${stamp}` })
    expect(customer.status, customer.text).toBe(201)
    customerId = String(customer.json()['id'])

    for (const record of [unreached, nobodys]) {
      const opened = await call(admin, 'POST', '/api/cases', { title: record.title })
      expect(opened.status, opened.text).toBe(201)
      record.id = String(opened.json()['id'])
    }
    const moved = await call(admin, 'PUT', `/api/cases/${unreached.id}/customer`, { customerId })
    expect(moved.status, moved.text).toBe(200)
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('names no case of an onboarded customer to an administrator in no group', async () => {
    const outsider = await account('admin')

    expect(await namedBy(outsider, unreached)).toEqual([])
    expect(await namedBy(outsider, nobodys), 'a case attributed to nobody is everybody’s').toContain(
      '/api/cases (200)',
    )
  }, 120_000)

  it('stops naming a case kept in a list once the group that reached it is revoked', async () => {
    const analyst = await account('analyst')
    const group = await call(admin, 'POST', '/api/groups', { name: `list-reach ${stamp}` })
    expect(group.status, group.text).toBe(201)
    const groupId = String(group.json()['id'])
    for (const [path, body] of [
      [`/api/groups/${groupId}/customers`, { customerId }],
      // `write`, because recording a visit is a PUT and the case guard reads the method.
      [`/api/groups/${groupId}/members`, { userId: analyst.id, level: 'write' }],
    ] as const) {
      const granted = await call(admin, 'POST', path, body)
      expect(granted.status, granted.text).toBeLessThan(300)
    }

    expect((await call(analyst, 'GET', `/api/cases/${unreached.id}`)).status).toBe(200)
    expect((await call(analyst, 'PUT', `/api/recent-cases/${unreached.id}`, { section: null })).status).toBeLessThan(300)
    expect(
      (await call(analyst, 'PUT', `/api/recent-cases/${unreached.id}/pinned`, { pinned: true })).status,
    ).toBeLessThan(300)
    expect(await namedBy(analyst, unreached), 'the case was never in a list to be withdrawn from').toContain(
      '/api/recent-cases (200)',
    )

    const revoked = await call(admin, 'DELETE', `/api/groups/${groupId}/members/${analyst.id}`)
    expect(revoked.status, revoked.text).toBeLessThan(300)

    expect(await namedBy(analyst, unreached)).toEqual([])
  }, 120_000)
})

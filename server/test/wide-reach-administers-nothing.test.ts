/**
 * **An analyst reaching every customer administers nothing** -- the second
 * requirement of `accounts-and-access`, which the specification states as two
 * powers that must not imply each other:
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Database } from '../src/db/client.js'

import {
  boot,
  bootable,
  operations,
  sharedAdmin,
  signIn,
  type Harness,
  type Persona,
} from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('an analyst reaching every customer administers nothing', () => {
  let harness: Harness
  let analyst: Persona
  let reached: string[]
  let refused: string[]

  beforeAll(async () => {
    harness = await boot()
    const admin = await sharedAdmin(harness)

    /**
     * **An analyst of this file's own, and that is not tidiness.**
     */
    const email = `wide-reach-${process.pid}@harness.test`
    const issued = 'wide-reach-issued-1234'
    const password = 'wide-reach-password-1234'
    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: email,
        displayName: 'Wide reach harness',
        password: issued,
        role: 'analyst',
      }),
    })
    if (!made.ok) throw new Error(`could not make the analyst: ${String(made.status)}`)
    const first = await signIn(harness, email, issued)
    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: first.cookie },
      body: JSON.stringify({ current: issued, password, repeat: password }),
    })
    if (!changed.ok) throw new Error(`the analyst could not set its password: ${String(changed.status)}`)
    analyst = await signIn(harness, email, password)

    const post = (path: string, body: unknown) =>
      fetch(`${harness.base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify(body),
      })

    // A group holding every customer this install has, with the analyst in it
    // at the strongest level. Built through the routes an administrator uses,
    // so the grant is the one the specification describes rather than a row.
    const madeGroup = await post('/api/groups', { name: `everything-${String(Date.now())}` })
    if (!madeGroup.ok) throw new Error(`could not make a group: ${String(madeGroup.status)}`)
    const { id: groupId } = (await madeGroup.json()) as { id: string }

    /**
     * **Read from the database rather than a route**, the way the harness's own
     * `grantsItselfDelete` does and for the same reason: no route lists customers
     * on this branch.
     */
    const { customers } = await import('../src/db/schema/index.js')
    const { DATABASE } = await import('../src/db/db.module.js')
    const all = await harness.app
      .get<Database>(DATABASE)
      .select({ id: customers.id })
      .from(customers)

    for (const one of all) {
      const held = await post(`/api/groups/${groupId}/customers`, { customerId: one.id })
      if (!held.ok) throw new Error(`could not hold ${one.id}: ${String(held.status)}`)
    }
    reached = all.map((one) => one.id)

    const joined = await post(`/api/groups/${groupId}/members`, {
      userId: analyst.id,
      level: 'delete',
    })
    if (!joined.ok) throw new Error(`could not join the group: ${String(joined.status)}`)

    refused = []
    for (const one of operations(harness.document)) {
      const answer = await fetch(`${harness.base}${one.path}`, {
        method: one.method,
        headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
        body: ['GET', 'DELETE'].includes(one.method) ? undefined : '{}',
      })
      if (answer.status === 403) refused.push(`${one.method} ${one.template}`)
    }
  }, 180_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * **The premise, and without it the whole file is vacuous.**
   */
  it('has been given reach over every customer the install holds', () => {
    expect(reached.length, 'the install holds no customers to reach').toBeGreaterThan(0)
  })

  /**
   * **The discriminator, and the reason this file is not the other one.**
   */
  it('reaches the case data its groups give it', async () => {
    const answer = await fetch(`${harness.base}/api/cases`, {
      headers: { cookie: analyst.cookie },
    })
    expect(answer.status, 'the analyst cannot read cases, so the refusals below prove nothing').toBe(
      200,
    )
  }, 30_000)

  /** And the refusals it did collect are real rather than an empty sweep. */
  it('was refused something', () => {
    expect(refused.length, 'nothing was refused, so the sweep found no management plane').toBeGreaterThan(0)
  })

  /**
   * The three the scenario names, spelled out, because they are the acts an
   * analyst who reached everything would most plausibly be let into.
   */
  it.each([
    ['create an account', 'POST', '/api/accounts'],
    ['create a group', 'POST', '/api/groups'],
  ])('refuses an analyst who reaches everything to %s', async (_what, method, path) => {
    const answer = await fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(answer.status, `${method} ${path} admitted an analyst with total reach`).toBe(403)
  }, 30_000)
})

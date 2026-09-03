/**
 * **An analyst reaching every customer administers nothing** -- the second
 * requirement of `accounts-and-access`, which the specification states as two
 * powers that must not imply each other:
 *
 * > Holding one MUST NOT imply holding the other. An administrator who has
 * > granted themselves no data access reaches no case's contents, and an
 * > analyst who reaches every customer's cases administers nothing.
 *
 * **`analyst-privilege.test.ts` asserts the refusals against an analyst in no
 * group**, which is the easy half. That analyst reaches nothing, so a refusal
 * proves only that the route is admin-gated -- it cannot distinguish "refused
 * because they administer nothing" from "refused because they reach nothing".
 * The scenario's own GIVEN is *an analyst reaching every customer through
 * groups*, and nothing set that up.
 *
 * So this one gives the analyst the strongest data reach the model allows --
 * `delete` over every customer the install holds, through a real group -- and
 * then asks the management plane the same question. If wide reach leaked into
 * administration anywhere, this is where it would show and the other file
 * would stay green.
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
     * **An analyst of this file's own, and that is not tidiness.** The first
     * version granted `sharedAnalyst` delete over every customer, which
     * persists in the database and is read by every other file: it broke
     * `the-level-survives-the-spelling.test.ts`, whose whole premise is an
     * analyst holding read and write and *not* delete. A fixture that widens a
     * shared persona's reach is a fixture that rewrites other files' givens.
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
     * `grantsItselfDelete` does and for the same reason: no route lists
     * customers on this branch. It is a read around the product, not a write
     * past it -- every grant below goes through the doors.
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
   * **The premise, and without it the whole file is vacuous.** An analyst in a
   * group holding nothing is the case the other file already covers, and every
   * assertion below would pass for the wrong reason.
   */
  it('has been given reach over every customer the install holds', () => {
    expect(reached.length, 'the install holds no customers to reach').toBeGreaterThan(0)
  })

  /**
   * **The discriminator, and the reason this file is not the other one.** An
   * analyst refused everything would satisfy the refusals below for the wrong
   * reason -- because they reach nothing, which is what `analyst-privilege`
   * already covers. So the data plane has to be shown *working* for the same
   * session in the same run: they reach the cases, and they still administer
   * nothing.
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

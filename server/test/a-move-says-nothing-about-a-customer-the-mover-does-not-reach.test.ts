/**
 * Moving a case says nothing about a customer the mover does not reach.
 *
 * > A refusal MUST NOT disclose the existence of something the caller may not
 * > reach.
 *
 * **The attack is a probe case.** An analyst who reaches only the default
 * customer opens a case carrying a guessed reference and moves it to another
 * organisation. Refused when that organisation holds the reference and moved
 * when it does not, the answer is an oracle for its tickets, and a miss plants
 * the probe in its list. So a case carrying a reference moves only to a
 * customer the mover reaches, and is refused the same way whatever that
 * customer holds.
 *
 * **A mover who reaches the destination is told which case holds it**, as a
 * create is: the answer is about a case they can open. A case with no
 * reference still moves anywhere, which is the ordinary triage.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  boot,
  bootable,
  sharedAdmin,
  sharedAnalyst,
  signIn,
  type Harness,
  type Persona,
} from './app-harness.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`
const HELD = `CHG-${TAG}`
/** Held by the customer too, and asked about only by somebody who reaches it. */
const ALSO_HELD = `CHG-${TAG}-B`

let harness: Harness
let admin: Persona
let prober: Persona
let insider: Persona
let victim = ''

const call = async (who: Persona, method: string, path: string, body?: unknown) => {
  const response = await fetch(`${harness.base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: who.cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  return {
    status: response.status,
    text,
    json: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
  }
}

/** A case opened by `who` carrying `reference`, then moved to `customerId`. */
async function moveOpened(who: Persona, reference: string | undefined, customerId: string) {
  const opened = await call(who, 'POST', '/api/cases', {
    title: `Probe ${reference ?? 'unreferenced'} ${TAG}`,
    ...(reference ? { reference } : {}),
  })
  expect(opened.status, opened.text).toBe(201)
  const id = opened.json['id'] as string
  const moved = await call(who, 'PUT', `/api/cases/${id}/customer`, { customerId })
  const after = await call(who, 'GET', `/api/cases/${id}`)
  return { id, moved, stillReads: after.status, customerAfter: after.json['customerId'] }
}

describe.skipIf(!(await bootable()))('moving a case to a customer', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    prober = await sharedAnalyst(harness)

    const email = `insider-${TAG}@example.invalid`
    const made = await call(admin, 'POST', '/api/accounts', {
      username: email,
      displayName: 'Insider',
      password: 'issued-password-1234',
      role: 'analyst',
    })
    expect(made.status, made.text).toBe(201)
    const held = await signIn(harness, email, 'issued-password-1234')
    const changed = await call(held, 'POST', '/api/change-password', {
      current: 'issued-password-1234',
      password: 'insider-password-1234',
      repeat: 'insider-password-1234',
    })
    expect(changed.status, changed.text).toBe(200)
    insider = await signIn(harness, email, 'insider-password-1234')

    const customer = await call(admin, 'POST', '/api/customers', { name: `Victim ${TAG}` })
    expect(customer.status, customer.text).toBe(201)
    victim = customer.json['id'] as string
    const group = await call(admin, 'POST', '/api/groups', { name: `victim-team-${TAG}` })
    const groupId = group.json['id'] as string
    const holds = await call(admin, 'POST', `/api/groups/${groupId}/customers`, {
      customerId: victim,
    })
    expect(holds.status, holds.text).toBeLessThan(300)
    const joins = await call(admin, 'POST', `/api/groups/${groupId}/members`, {
      userId: insider.id,
      level: 'write',
    })
    expect(joins.status, joins.text).toBeLessThan(300)

    for (const reference of [HELD, ALSO_HELD]) {
      const theirs = await moveOpened(insider, reference, victim)
      expect(theirs.moved.status, theirs.moved.text).toBe(200)
    }
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('refuses a referenced case the same way whether or not the customer holds its reference', async () => {
    const hit = await moveOpened(prober, HELD, victim)
    const miss = await moveOpened(prober, `${HELD}-X`, victim)

    const answer = (one: typeof hit) => ({ status: one.moved.status, body: one.moved.json })
    expect(answer(miss), 'the answer depends on what the unreached customer holds').toEqual(
      answer(hit),
    )
    expect(hit.moved.status).toBe(403)
    expect(hit.moved.text).not.toContain(HELD)
    // Neither probe was planted in the customer, so neither left the mover's list.
    expect([hit.stillReads, miss.stillReads]).toEqual([200, 200])
  })

  it('tells a mover who reaches the customer which case holds the reference', async () => {
    const again = await moveOpened(insider, ALSO_HELD, victim)

    expect(again.moved.status).toBe(409)
    expect(again.moved.json['message']).toContain(`Probe ${ALSO_HELD} ${TAG}`)
    expect(again.customerAfter, 'the refused case moved anyway').not.toBe(victim)
  })

  it('still moves a case with no reference to a customer the mover does not reach', async () => {
    const plain = await moveOpened(prober, undefined, victim)

    expect(plain.moved.status, plain.moved.text).toBe(200)
    // Moved out of their reach, which is the ordinary triage and costs them the case.
    expect(plain.stillReads).toBe(404)
  })
})

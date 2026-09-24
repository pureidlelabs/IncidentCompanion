/**
 * A password guessed at through any door the install serves counts toward the
 * lock, and a locked account's password is wrong at every door.
 *
 * The doors are the two that check a password over HTTP: signing in, and the
 * app's own password change, which checks the current one. Each case uses a
 * fresh account, because a case that locks one leaves it locked.
 */
import { and, eq, gt, max, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Database } from '../src/db/client.js'
import { DATABASE } from '../src/db/db.module.js'
import { account, installActivity, user } from '../src/db/schema/index.js'
import { LOCKOUT_AFTER_FAILURES } from '../src/policy/keys.js'
import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'

const ISSUED = 'door-issued-password-1234'
const CHOSEN = 'door-chosen-password-1234'
const NEXT = 'door-next-password-12345'

let harness: Harness
let db: Database
let admin: Persona

/** A fresh analyst holding `CHOSEN`, signed in, with nothing counted against it. */
async function anAccount(label: string): Promise<Persona> {
  const email = `door-${label}-${String(Date.now())}-${String(Math.random()).slice(2, 7)}@harness.test`
  const made = await fetch(`${harness.base}/api/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin.cookie },
    body: JSON.stringify({
      username: email,
      displayName: `Door ${label}`,
      password: ISSUED,
      role: 'analyst',
    }),
  })
  expect(made.ok, `making ${label} answered ${String(made.status)}`).toBe(true)
  const issued = await signIn(harness, email, ISSUED)
  expect((await changePassword(issued.cookie, ISSUED)).status).toBe(200)
  return signIn(harness, email, CHOSEN)
}

function changePassword(cookie: string, current: string, next = CHOSEN) {
  return fetch(`${harness.base}/api/change-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ current, password: next, repeat: next }),
  })
}

function signInAs(email: string, password: string) {
  return fetch(`${harness.base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

async function stateOf(who: Persona) {
  const [row] = await db
    .select({ failed: user.failedSignIns, lockedUntil: user.lockedUntil, hash: account.password })
    .from(user)
    .innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, 'credential')))
    .where(eq(user.id, who.id))
  return row!
}

async function lastSeq(): Promise<bigint> {
  const [row] = await db.select({ seq: max(installActivity.seq) }).from(installActivity)
  return row?.seq ?? 0n
}

async function failuresSince(seq: bigint, who: Persona) {
  return db
    .select({ detail: installActivity.detail })
    .from(installActivity)
    .where(
      and(
        eq(installActivity.event, 'sign_in_failed'),
        gt(installActivity.seq, seq),
        sql`${installActivity.detail}->>'account' = ${who.email}`,
      ),
    )
}

describe.skipIf(!(await bootable()))('a password guessed at through any door', () => {
  beforeAll(async () => {
    harness = await boot()
    db = harness.app.get<Database>(DATABASE)
    admin = await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('counts a wrong current password at the change door, and records each one', async () => {
    const who = await anAccount('counted')
    const since = await lastSeq()

    for (let i = 0; i < 3; i += 1) {
      const wrong = await changePassword(who.cookie, `not-the-password-${String(i)}`, NEXT)
      expect(wrong.status).toBe(422)
    }

    expect((await stateOf(who)).failed, 'a wrong current password was not counted').toBe(3)
    const lines = await failuresSince(since, who)
    expect(lines.map((one) => (one.detail as { path?: string }).path)).toEqual([
      '/change-password',
      '/change-password',
      '/change-password',
    ])
  }, 60_000)

  it('locks the account from the change door alone', async () => {
    const who = await anAccount('locked-there')

    for (let i = 0; i < LOCKOUT_AFTER_FAILURES; i += 1) {
      await changePassword(who.cookie, `not-the-password-${String(i)}`, NEXT)
    }

    expect(
      (await stateOf(who)).lockedUntil,
      'guessing at the change door never locks',
    ).not.toBeNull()
    expect((await signInAs(who.email, CHOSEN)).status, 'the locked account signed in').toBe(401)
  }, 60_000)

  it('counts both doors into one run', async () => {
    const who = await anAccount('both-doors')

    await changePassword(who.cookie, 'not-the-password-a', NEXT)
    await signInAs(who.email, 'not-the-password-b')
    await changePassword(who.cookie, 'not-the-password-c', NEXT)

    expect((await stateOf(who)).failed).toBe(3)
  }, 60_000)

  it("answers a locked account's right password as a wrong one at the change door, and changes nothing", async () => {
    const who = await anAccount('locked-right')
    for (let i = 0; i < LOCKOUT_AFTER_FAILURES; i += 1) {
      await signInAs(who.email, `not-the-password-${String(i)}`)
    }
    const locked = await stateOf(who)
    expect(locked.lockedUntil, 'the account did not lock').not.toBeNull()

    const wrong = await changePassword(who.cookie, 'still-not-the-password', NEXT)
    const right = await changePassword(who.cookie, CHOSEN, NEXT)

    expect(right.status, 'the right password was answered differently from a wrong one').toBe(
      wrong.status,
    )
    expect(await right.text()).toBe(await wrong.text())
    expect((await stateOf(who)).hash, "a locked account's password was changed").toBe(locked.hash)
    expect((await signInAs(who.email, NEXT)).status).toBe(401)
  }, 60_000)

  it('clears the count when the right password is given at the change door', async () => {
    const who = await anAccount('cleared')
    await signInAs(who.email, 'not-the-password')
    expect((await stateOf(who)).failed).toBe(1)

    expect((await changePassword(who.cookie, CHOSEN, NEXT)).status).toBe(200)

    expect((await stateOf(who)).failed, 'a right password left the count standing').toBe(0)
  }, 60_000)
})

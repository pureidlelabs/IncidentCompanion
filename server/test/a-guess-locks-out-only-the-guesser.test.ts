/**
 * Guessing at an account from one machine locks out the machines guessing,
 * and never the holder at a machine they have signed in from.
 *
 * Each machine is a distinct client address, presented the way the edge
 * presents it. Every case uses a fresh account, since a lock outlives the case
 * that made it.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Database } from '../src/db/client.js'
import { DATABASE } from '../src/db/db.module.js'
import { installActivity, signInLockout, user } from '../src/db/schema/index.js'
import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const PASSWORD = 'the-holders-own-password'
const THRESHOLD = 4
const FIRST_LOCK = 5
const LONGEST_LOCK = 15

let harness: Harness
let db: Database
let admin: Persona

/**
 * Where a request comes from, as the edge says so. The app believes the
 * header only in production, which is why the file boots in it.
 */
const machine = (last: number) => `198.51.100.${String(last)}`

function signInFrom(address: string, email: string, password: string) {
  return fetch(`${harness.base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': address },
    body: JSON.stringify({ email, password }),
  })
}

async function statusFrom(address: string, email: string, password: string): Promise<number> {
  return (await signInFrom(address, email, password)).status
}

/** Distinct wrong passwords, so each one counts. */
async function guessFrom(address: string, email: string, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    expect(await statusFrom(address, email, `wrong-${randomUUID()}`)).toBe(401)
  }
}

async function anAccount(): Promise<string> {
  const email = `guessed-${randomUUID().slice(0, 8)}@harness.test`
  const made = await fetch(`${harness.base}/api/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin.cookie },
    body: JSON.stringify({ username: email, displayName: 'Guessed At', password: PASSWORD, role: 'analyst' }),
  })
  expect(made.ok, `making ${email} answered ${String(made.status)}`).toBe(true)
  return email
}

async function setPolicy(key: string, value: number): Promise<void> {
  const set = await fetch(`${harness.base}/api/install/policy`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: admin.cookie },
    body: JSON.stringify({ key, value }),
  })
  expect(set.ok, `${key} answered ${String(set.status)}`).toBe(true)
}

/** How long each lock of this account lasted, in minutes, as the audit recorded it. */
async function locksOf(email: string): Promise<number[]> {
  const lines = await db
    .select({ detail: installActivity.detail })
    .from(installActivity)
    .where(and(eq(installActivity.event, 'account_locked'), eq(installActivity.targetLabel, email)))
    .orderBy(installActivity.seq)
  return lines.map((line) => Number((line.detail as { minutes?: string }).minutes))
}

/** Every lock on this account runs out now, as though its time had passed. */
async function ageTheLocks(email: string): Promise<void> {
  await db
    .update(signInLockout)
    .set({ lockedUntil: sql`now() - interval '1 second'` })
    .where(inArray(signInLockout.userId, db.select({ id: user.id }).from(user).where(eq(user.email, email))))
}

describe.skipIf(!(await bootable()))('guessing at an account from machines on the network', () => {
  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'production')
    harness = await boot()
    db = harness.app.get<Database>(DATABASE)
    admin = await sharedAdmin(harness)
    await setPolicy('auth.lockoutAfterFailures', THRESHOLD)
    await setPolicy('auth.lockoutMinutes', FIRST_LOCK)
    await setPolicy('auth.lockoutMaxMinutes', LONGEST_LOCK)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
    vi.unstubAllEnvs()
  })

  it('does not lock the holder out of the machine they sign in from', async () => {
    const email = await anAccount()
    const [holder, guesser] = [machine(10), machine(20)]
    expect(await statusFrom(holder, email, PASSWORD)).toBe(200)

    await guessFrom(guesser, email, THRESHOLD)

    expect(await statusFrom(guesser, email, PASSWORD), 'the guesser was not locked out').toBe(401)
    expect(
      await statusFrom(holder, email, PASSWORD),
      "another machine's guessing locked the holder out of their own",
    ).toBe(200)
  }, 60_000)

  it('locks every machine the account has not signed in from when guesses are spread across several', async () => {
    const email = await anAccount()
    const holder = machine(11)
    expect(await statusFrom(holder, email, PASSWORD)).toBe(200)

    for (let one = 0; one < THRESHOLD; one += 1) await guessFrom(machine(30 + one), email, 1)

    expect(
      await statusFrom(machine(40), email, PASSWORD),
      'a machine that never guessed signed in while the guessing was locked out',
    ).toBe(401)
    expect(await statusFrom(holder, email, PASSWORD), 'the holder was locked out').toBe(200)
  }, 60_000)

  it("locks only the holder's machines when the guessing comes from one of them", async () => {
    const email = await anAccount()
    const holder = machine(12)
    expect(await statusFrom(holder, email, PASSWORD)).toBe(200)

    await guessFrom(holder, email, THRESHOLD)

    expect(await statusFrom(holder, email, PASSWORD), 'the guessing machine was not locked out').toBe(401)
    expect(
      await statusFrom(machine(50), email, PASSWORD),
      "guessing from the holder's machine locked out a machine it has never signed in from",
    ).toBe(200)
  }, 60_000)

  it('counts the same wrong password once, however often it is offered', async () => {
    const repeated = await anAccount()
    const guesser = machine(21)
    for (let i = 0; i < THRESHOLD + 2; i += 1) {
      expect(await statusFrom(guesser, repeated, 'the-same-wrong-password')).toBe(401)
    }
    expect(
      await statusFrom(guesser, repeated, PASSWORD),
      'one wrong password repeated locked the account',
    ).toBe(200)

    const counted = await anAccount()
    for (let i = 0; i < 3; i += 1) await statusFrom(guesser, counted, 'the-same-wrong-password')
    await guessFrom(guesser, counted, THRESHOLD - 1)
    expect(
      await statusFrom(guesser, counted, PASSWORD),
      'a repeated wrong password counted as nothing at all',
    ).toBe(401)
  }, 60_000)

  it("makes each lock that follows another longer, up to the install's maximum", async () => {
    const email = await anAccount()
    const guesser = machine(22)

    for (let round = 0; round < 4; round += 1) {
      await guessFrom(guesser, email, THRESHOLD)
      await ageTheLocks(email)
    }
    expect(await locksOf(email)).toEqual([FIRST_LOCK, 2 * FIRST_LOCK, LONGEST_LOCK, LONGEST_LOCK])

    await guessFrom(guesser, email, THRESHOLD - 1)
    expect((await locksOf(email)).length, 'a lock that had lifted came back short of the threshold').toBe(4)
  }, 90_000)

  it("clears every run when an administrator releases the account", async () => {
    const email = await anAccount()
    const [holder, guesser] = [machine(13), machine(23)]
    expect(await statusFrom(holder, email, PASSWORD)).toBe(200)
    await guessFrom(guesser, email, THRESHOLD)
    await ageTheLocks(email)
    await guessFrom(guesser, email, THRESHOLD)
    await guessFrom(holder, email, THRESHOLD)
    expect(await locksOf(email)).toEqual([FIRST_LOCK, 2 * FIRST_LOCK, FIRST_LOCK])
    expect(await statusFrom(holder, email, PASSWORD)).toBe(401)

    const reissued = 'a-password-the-administrator-chose'
    const released = await fetch(`${harness.base}/api/accounts/${encodeURIComponent(email)}/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ password: reissued }),
    })
    expect(released.status).toBe(200)

    expect(await statusFrom(holder, email, reissued), "the release left the holder's machine locked out").toBe(200)
    // No machine it has not signed in from succeeds first, since a success
    // would clear that run by itself.
    await guessFrom(machine(24), email, THRESHOLD)
    expect(
      await locksOf(email),
      'the release left the other machines locked out, or their next lock was not the first again',
    ).toEqual([FIRST_LOCK, 2 * FIRST_LOCK, FIRST_LOCK, FIRST_LOCK])
  }, 90_000)
})

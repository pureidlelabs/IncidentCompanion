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
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Database } from '../src/db/client.js'
import { DATABASE } from '../src/db/db.module.js'
import { installActivity, signInLockout, user } from '../src/db/schema/index.js'
import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { ADMIN_URL } from './global-setup.js'

const PASSWORD = 'the-holders-own-password'
const THRESHOLD = 4
const FIRST_LOCK = 5
const LONGEST_LOCK = 15

let harness: Harness
let db: Database
let admin: Persona

/**
 * Where a request comes from, as the edge says so. The edge is named
 * `localhost`, so the harness's own client is it and its forwarded address is believed.
 */
const machine = (last: number) => `198.51.100.${String(last)}`

function signInFrom(address: string, email: string, password: string) {
  return fetch(`${harness.base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
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
    vi.stubEnv('IC_EDGE', 'localhost')
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

  it('lets the holder in after the threshold is lowered below their run\'s count', async () => {
    const email = await anAccount()
    const holder = machine(62)
    expect(await statusFrom(holder, email, PASSWORD)).toBe(200)
    await guessFrom(holder, email, 2)

    await setPolicy('auth.lockoutAfterFailures', 2)
    try {
      expect(await statusFrom(holder, email, PASSWORD), 'a run over the new threshold refused its holder with no lock').toBe(200)
    } finally {
      await setPolicy('auth.lockoutAfterFailures', THRESHOLD)
    }
  }, 60_000)

  it('locks a run over a lowered threshold at its next failure', async () => {
    const email = await anAccount()
    const guesser = machine(63)
    await guessFrom(guesser, email, 2)

    await setPolicy('auth.lockoutAfterFailures', 2)
    try {
      await guessFrom(guesser, email, 1)
      expect(await statusFrom(guesser, email, PASSWORD), 'a run over the new threshold never locked').toBe(401)
      expect(await locksOf(email)).toEqual([FIRST_LOCK])
    } finally {
      await setPolicy('auth.lockoutAfterFailures', THRESHOLD)
    }
  }, 60_000)

  it('locks a run once when the failures reaching the threshold arrive together', async () => {
    const email = await anAccount()
    const guesser = machine(64)
    const burst = () =>
      Promise.all(
        Array.from({ length: THRESHOLD + 2 }, () => statusFrom(guesser, email, `wrong-${randomUUID()}`)),
      )

    expect(new Set(await burst())).toEqual(new Set([401]))
    expect(await statusFrom(guesser, email, PASSWORD), 'the burst did not lock the run').toBe(401)
    await ageTheLocks(email)
    await burst()

    expect(await locksOf(email), 'a burst locked more than once, or its lock did not follow the last').toEqual([
      FIRST_LOCK,
      2 * FIRST_LOCK,
    ])
  }, 60_000)

  it('refuses a right password that arrives after the failure reaching the threshold', async () => {
    const email = await anAccount()
    const guesser = machine(65)
    await guessFrom(guesser, email, THRESHOLD - 1)

    // Holding the run's row queues the failure, then the right password, behind it in that order.
    const [failure, right] = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select 1 from ${signInLockout} where ${signInLockout.userId} = (select ${user.id} from ${user} where ${user.email} = ${email}) for update`,
      )
      const waitingBehind = async (count: number) => {
        for (let tries = 0; tries < 200; tries += 1) {
          // A transaction reads the activity view once and keeps that copy unless told to drop it.
          await tx.execute(sql`select pg_stat_clear_snapshot()`)
          const { rows } = await tx.execute<{ waiting: number }>(sql`
            with first as (select pid from pg_stat_activity where pg_backend_pid() = any(pg_blocking_pids(pid)))
            select (select count(*) from first)::int
              + (select count(*) from pg_stat_activity where pg_blocking_pids(pid) && array(select pid from first))::int as waiting`)
          if ((rows[0]?.waiting ?? 0) >= count) return
          await new Promise((settle) => setTimeout(settle, 25))
        }
        throw new Error(`fewer than ${String(count)} sign-ins queued behind the held run`)
      }
      const failure = statusFrom(guesser, email, `wrong-${randomUUID()}`)
      await waitingBehind(1)
      const right = statusFrom(guesser, email, PASSWORD)
      await waitingBehind(2)
      return [failure, right]
    })

    expect(await failure).toBe(401)
    expect(await right, 'a right password after the locking failure was let in').toBe(401)
    expect(await locksOf(email)).toEqual([FIRST_LOCK])
  }, 60_000)

  it('tells two machines on one IPv6 network apart', async () => {
    const email = await anAccount()
    const holder = '2001:db8:0:1::10'
    expect(await statusFrom(holder, email, PASSWORD)).toBe(200)

    await guessFrom('2001:db8:0:1::20', email, THRESHOLD)

    expect(await statusFrom(holder, email, PASSWORD), 'a neighbour on the holder\'s network locked them out').toBe(200)
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

    const afterAnother = await anAccount()
    await guessFrom(guesser, afterAnother, 1)
    for (let i = 0; i < THRESHOLD + 2; i += 1) {
      expect(await statusFrom(guesser, afterAnother, 'the-same-wrong-password')).toBe(401)
    }
    expect(
      await statusFrom(guesser, afterAnother, PASSWORD),
      'a wrong password repeated after another failure locked the account',
    ).toBe(200)
  }, 60_000)

  it('writes no lock the audit log cannot record', async () => {
    const email = await anAccount()
    const guesser = machine(66)
    const onTestDatabase = new URL(process.env.DATABASE_URL ?? '')
    const owner = new URL(ADMIN_URL)
    onTestDatabase.username = owner.username
    onTestDatabase.password = owner.password
    const admin = new Client({ connectionString: onTestDatabase.toString() })
    await admin.connect()
    const name = `refuse_${randomUUID().slice(0, 8)}`
    try {
      await admin.query(`
        create function ${name}() returns trigger language plpgsql as $$
        begin raise exception 'audit log refused'; end $$`)
      await admin.query(
        `create trigger ${name} before insert on install_activity for each row
         when (new.event = 'account_locked' and new.target_label = '${email}') execute function ${name}()`,
      )
      await guessFrom(guesser, email, THRESHOLD)
    } finally {
      await admin.query(`drop trigger if exists ${name} on install_activity`)
      await admin.query(`drop function if exists ${name}()`)
      await admin.end()
    }

    const [run] = await db
      .select({ lockedUntil: signInLockout.lockedUntil })
      .from(signInLockout)
      .innerJoin(user, eq(user.id, signInLockout.userId))
      .where(eq(user.email, email))
    expect(run?.lockedUntil ?? null, 'a lock was written with no audit line').toBeNull()
    expect(await locksOf(email)).toEqual([])
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

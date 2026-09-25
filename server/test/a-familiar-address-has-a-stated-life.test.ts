/**
 * An address the account's right password came from stays familiar for 90
 * days after the last one, and only among the account's 20 most recent;
 * past either, a sign-in from it counts in the unfamiliar run.
 *
 * Each case locks the unfamiliar run from a guessing machine and then asks
 * which of the holder's addresses it shut.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { FamiliarAddressPrune } from '../src/auth/familiar-address-prune.js'
import type { Database } from '../src/db/client.js'
import { DATABASE } from '../src/db/db.module.js'
import { familiarAddress, installActivity, user } from '../src/db/schema/index.js'
import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { ADMIN_URL } from './global-setup.js'

const PASSWORD = 'the-holders-own-password'
const THRESHOLD = 4
const GUESSER = '192.0.2.250'

let harness: Harness
let db: Database
let admin: Persona

const machine = (last: number) => `203.0.113.${String(last)}`

async function statusFrom(address: string, email: string, password: string): Promise<number> {
  const answered = await fetch(`${harness.base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
    body: JSON.stringify({ email, password }),
  })
  return answered.status
}

async function signInFrom(email: string, ...addresses: string[]): Promise<void> {
  for (const address of addresses) expect(await statusFrom(address, email, PASSWORD), address).toBe(200)
}

/** The unfamiliar run, shut by a machine the account has never signed in from. */
async function lockTheUnfamiliarRun(email: string): Promise<void> {
  for (let i = 0; i < THRESHOLD; i += 1) {
    expect(await statusFrom(GUESSER, email, `wrong-${randomUUID()}`)).toBe(401)
  }
  expect(await statusFrom(GUESSER, email, PASSWORD), 'the guessing did not lock the unfamiliar run').toBe(401)
}

async function anAccount(): Promise<string> {
  const email = `familiar-${randomUUID().slice(0, 8)}@harness.test`
  const made = await fetch(`${harness.base}/api/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin.cookie },
    body: JSON.stringify({ username: email, displayName: 'Familiar', password: PASSWORD, role: 'analyst' }),
  })
  expect(made.ok, `making ${email} answered ${String(made.status)}`).toBe(true)
  return email
}

const ofAccount = (email: string) =>
  inArray(familiarAddress.userId, db.select({ id: user.id }).from(user).where(eq(user.email, email)))

/** The account's last right password from `address` is moved `days` further into the past. */
async function pushBack(email: string, address: string, days: number): Promise<void> {
  const moved = await db
    .update(familiarAddress)
    .set({ lastRightAt: sql`${familiarAddress.lastRightAt} - make_interval(days => ${days})` })
    .where(and(ofAccount(email), eq(familiarAddress.address, address)))
    .returning({ address: familiarAddress.address })
  expect(moved, `${address} was not familiar to move`).toHaveLength(1)
}

async function heldFor(email: string): Promise<string[]> {
  const rows = await db.select({ address: familiarAddress.address }).from(familiarAddress).where(ofAccount(email))
  return rows.map((row) => row.address).sort()
}

async function lastSeq(): Promise<bigint> {
  const [row] = await db.select({ seq: sql<string>`coalesce(max(${installActivity.seq}), 0)` }).from(installActivity)
  return BigInt(row?.seq ?? 0)
}

async function prunesSince(seq: bigint) {
  return db
    .select({ detail: installActivity.detail })
    .from(installActivity)
    .where(and(eq(installActivity.event, 'familiar_addresses_pruned'), gt(installActivity.seq, seq)))
}

describe.skipIf(!(await bootable()))('how long an address stays familiar', () => {
  beforeAll(async () => {
    vi.stubEnv('IC_EDGE', 'localhost')
    harness = await boot()
    db = harness.app.get<Database>(DATABASE)
    admin = await sharedAdmin(harness)
    for (const [key, value] of [
      ['auth.lockoutAfterFailures', THRESHOLD],
      ['auth.lockoutMinutes', 5],
      ['auth.lockoutMaxMinutes', 15],
    ] as const) {
      const set = await fetch(`${harness.base}/api/install/policy`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify({ key, value }),
      })
      expect(set.ok, `${key} answered ${String(set.status)}`).toBe(true)
    }
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
    vi.unstubAllEnvs()
  })

  it('counts an address unused for more than 90 days in the unfamiliar run', async () => {
    const email = await anAccount()
    const [aged, lately, today] = [machine(1), machine(2), machine(3)]
    await signInFrom(email, aged, lately, today)
    await pushBack(email, aged, 91)
    await pushBack(email, lately, 89)

    await lockTheUnfamiliarRun(email)

    expect(await statusFrom(aged, email, PASSWORD), 'an address unused for 91 days was still familiar').toBe(401)
    expect(await statusFrom(lately, email, PASSWORD), 'an address used 89 days ago was no longer familiar').toBe(200)
    expect(await statusFrom(today, email, PASSWORD)).toBe(200)
  }, 60_000)

  it("starts an address's 90 days again at each right password from it", async () => {
    const email = await anAccount()
    const holder = machine(4)
    await signInFrom(email, holder)
    await pushBack(email, holder, 89)
    await signInFrom(email, holder)
    await pushBack(email, holder, 2)

    await lockTheUnfamiliarRun(email)

    expect(await statusFrom(holder, email, PASSWORD), 'a right password did not renew the address').toBe(200)
  }, 60_000)

  it('forgets the least recent of 20 familiar addresses when a 21st gives the right password', async () => {
    const email = await anAccount()
    const twenty = Array.from({ length: 20 }, (_, i) => machine(100 + i))
    await signInFrom(email, ...twenty)
    await signInFrom(email, machine(100))
    await signInFrom(email, machine(120))

    await lockTheUnfamiliarRun(email)

    expect(await statusFrom(machine(101), email, PASSWORD), 'the least recent address survived a 21st').toBe(401)
    expect(await statusFrom(machine(100), email, PASSWORD), 'a renewed address was forgotten').toBe(200)
    expect(await statusFrom(machine(102), email, PASSWORD)).toBe(200)
    expect(await statusFrom(machine(120), email, PASSWORD)).toBe(200)
  }, 90_000)

  it('prunes what is no longer familiar, and records the pass by count', async () => {
    const email = await anAccount()
    const addresses = Array.from({ length: 22 }, (_, i) => machine(130 + i))
    await signInFrom(email, ...addresses)
    await pushBack(email, machine(151), 91)
    const before = await lastSeq()

    await harness.app.get(FamiliarAddressPrune).prune()

    expect(await heldFor(email), 'the aged address or the 21st most recent was kept').toEqual(
      addresses.slice(1, 21).sort(),
    )
    const lines = await prunesSince(before)
    expect(lines, 'the pruning was not recorded once').toHaveLength(1)
    const detail = lines[0]?.detail as Record<string, string>
    expect(Number(detail.removed)).toBeGreaterThanOrEqual(2)
    expect(detail).toMatchObject({ days: '90', mostPerAccount: '20' })
    expect(JSON.stringify(detail), 'the record names an address it pruned').not.toContain('203.0.113.')
  }, 90_000)

  it('keeps every address when the pruning cannot be recorded', async () => {
    const email = await anAccount()
    await signInFrom(email, machine(160), machine(161))
    await pushBack(email, machine(160), 91)

    const onTestDatabase = new URL(process.env.DATABASE_URL ?? '')
    const owner = new URL(ADMIN_URL)
    onTestDatabase.username = owner.username
    onTestDatabase.password = owner.password
    const client = new Client({ connectionString: onTestDatabase.toString() })
    await client.connect()
    const name = `refuse_${randomUUID().slice(0, 8)}`
    await client.query(`create function ${name}() returns trigger language plpgsql as $$
      begin raise exception 'audit log refused'; end $$`)
    await client.query(`create trigger ${name} before insert on install_activity for each row
      when (new.event = 'familiar_addresses_pruned') execute function ${name}()`)
    try {
      await expect(harness.app.get(FamiliarAddressPrune).prune()).rejects.toThrow()
    } finally {
      await client.query(`drop trigger if exists ${name} on install_activity`)
      await client.query(`drop function if exists ${name}()`)
      await client.end()
    }

    expect(await heldFor(email), 'an address was pruned with no record of it').toEqual([machine(160), machine(161)])
  }, 60_000)
})

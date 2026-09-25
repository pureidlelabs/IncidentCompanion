/**
 * An account act that waits behind another is decided by who its caller is
 * when its turn comes, and waiting starves nothing else.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'

const STAMP = String(Date.now())
const ISSUED = 'an-issued-password-long-enough'
const OWN = 'their-own-password-long-enough'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!(await bootable()))('an account act that waits its turn', () => {
  let harness: Harness
  let pool: ReturnType<typeof openTestPool>
  let admin: Persona
  const made: string[] = []

  const post = async (who: Persona, path: string, body?: unknown) => {
    const answer = await fetch(`${harness.base}${path}`, {
      method: 'POST',
      headers: { cookie: who.cookie, 'content-type': 'application/json', origin: harness.origin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: answer.status, text: await answer.text() }
  }

  const at = (email: string) => `/api/accounts/${encodeURIComponent(email)}`

  const anAccount = async (tag: string, role: 'admin' | 'analyst') => {
    const email = `turn-${tag}-${STAMP}@example.test`
    const created = await post(admin, '/api/accounts', { username: email, displayName: tag, password: ISSUED, role })
    expect(created.status, created.text).toBe(201)
    made.push(email)
    return email
  }

  /** An administrator of their own, past the password hold, signed in. */
  const anAdministrator = async (tag: string) => {
    const email = await anAccount(tag, 'admin')
    const held = await signIn(harness, email, ISSUED)
    expect((await post(held, '/api/change-password', { current: ISSUED, password: OWN, repeat: OWN })).status).toBe(200)
    return signIn(harness, email, OWN)
  }

  const heldBy = async (email: string) =>
    (await pool.query<{ role: string | null; banned: boolean | null }>('select role, banned from "user" where email = $1', [email]))
      .rows[0]!

  const linesBy = async (actor: string) =>
    (await pool.query<{ event: string }>(`select event from install_activity where actor_id = $1 and event::text like 'account_%'`, [actor]))
      .rows.map((row) => row.event)

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
  }, 120_000)

  afterAll(async () => {
    await pool?.query(`update "user" set role = 'analyst', banned = false where email = any($1)`, [made])
    await pool?.end()
    await harness?.close()
  })

  /**
   * B's act is queued behind the account-state lock, A's act on B is queued
   * ahead of it, and then the lock is let go.
   */
  const queuedBehind = async (first: () => Promise<unknown>, second: () => Promise<{ status: number }>) => {
    const holder = await pool.connect()
    try {
      await holder.query(`select pg_advisory_lock(hashtext('account-state'))`)
      const ahead = first()
      await pause(300)
      const behind = second()
      await pause(300)
      await holder.query(`select pg_advisory_unlock(hashtext('account-state'))`)
      await ahead
      return await behind
    } finally {
      holder.release()
    }
  }

  it('refuses an act whose caller was demoted while it waited, and writes nothing', async () => {
    const a = await anAdministrator('demoter')
    const b = await anAdministrator('demoted')
    const target = await anAccount('promoted', 'analyst')

    const answer = await queuedBehind(
      () => post(a, `${at(b.email)}/role`, { role: 'analyst' }),
      () => post(b, `${at(target)}/role`, { role: 'admin' }),
    )

    expect({ status: answer.status, target: await heldBy(target), lines: await linesBy(b.id) }).toEqual({
      status: 403,
      target: { role: 'analyst', banned: false },
      lines: [],
    })
  })

  it('refuses a disable whose caller was disabled while it waited, and writes nothing', async () => {
    const a = await anAdministrator('disabler')
    const b = await anAdministrator('disabled')
    const target = await anAccount('spared', 'analyst')

    const answer = await queuedBehind(
      () => post(a, `${at(b.email)}/disable`),
      () => post(b, `${at(target)}/disable`),
    )

    expect({ status: answer.status, target: await heldBy(target), lines: await linesBy(b.id) }).toEqual({
      status: 403,
      target: { role: 'analyst', banned: false },
      lines: [],
    })
  })

  it('refuses an enable whose caller was demoted while it waited, and writes nothing', async () => {
    const a = await anAdministrator('demoter-two')
    const b = await anAdministrator('demoted-two')
    const target = await anAccount('kept-out', 'analyst')
    expect((await post(admin, `${at(target)}/disable`)).status).toBe(200)

    const answer = await queuedBehind(
      () => post(a, `${at(b.email)}/role`, { role: 'analyst' }),
      () => post(b, `${at(target)}/enable`),
    )

    expect({ status: answer.status, target: await heldBy(target), lines: await linesBy(b.id) }).toEqual({
      status: 403,
      target: { role: 'analyst', banned: true },
      lines: [],
    })
  })

  it('answers many acts at once promptly, and starves no other route meanwhile', async () => {
    const target = await anAccount('crowded', 'analyst')
    const started = Date.now()
    const acts = Array.from({ length: 20 }, () => post(admin, `${at(target)}/role`, { role: 'analyst' }))
    await pause(50)
    const asideStarted = Date.now()
    const aside = await fetch(`${harness.base}/api/groups`, { headers: { cookie: admin.cookie } })
    const asideTook = Date.now() - asideStarted
    const statuses = (await Promise.all(acts)).map((one) => one.status)

    expect({ statuses, aside: aside.status }).toEqual({ statuses: statuses.map(() => 200), aside: 200 })
    expect(asideTook, 'an unrelated route waited on the account acts').toBeLessThan(2_000)
    expect(Date.now() - started, 'the acts took too long').toBeLessThan(5_000)
  }, 30_000)
})

/**
 * Two administrators, the install's last, each demote or disable the other at
 * the same moment: one succeeds, the other is refused, and an administrator
 * who can sign in remains.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'

const STAMP = String(Date.now())
const ISSUED = 'an-issued-password-long-enough'
const OWN = 'their-own-password-long-enough'

describe.skipIf(!(await bootable()))('two administrators acting on each other at once', () => {
  let harness: Harness
  let pool: ReturnType<typeof openTestPool>
  let parked: string[] = []
  const pair: { email: string; id: string }[] = []

  const post = async (who: Persona, path: string, body?: unknown) =>
    (
      await fetch(`${harness.base}${path}`, {
        method: 'POST',
        headers: { cookie: who.cookie, 'content-type': 'application/json', origin: harness.origin },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    ).status

  const administering = async () =>
    (
      await pool.query<{ email: string }>(`select email from "user" where role = 'admin' and banned is not true`)
    ).rows.map((row) => row.email)

  beforeAll(async () => {
    harness = await boot()
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    const admin = await sharedAdmin(harness)
    for (const tag of ['first', 'second']) {
      const email = `last-pair-${tag}-${STAMP}@example.test`
      expect(await post(admin, '/api/accounts', { username: email, displayName: tag, password: ISSUED, role: 'admin' })).toBe(201)
      const held = await signIn(harness, email, ISSUED)
      expect(await post(held, '/api/change-password', { current: ISSUED, password: OWN, repeat: OWN })).toBe(200)
      pair.push({ email, id: (await signIn(harness, email, OWN)).id })
    }
    parked = (await administering()).filter((email) => !pair.some((one) => one.email === email))
    await pool.query(`update "user" set role = 'analyst' where email = any($1)`, [parked])
  }, 120_000)

  afterAll(async () => {
    await pool?.query(`update "user" set role = 'admin' where email = any($1)`, [parked])
    await pool?.query(`update "user" set role = 'analyst', banned = false where email = any($1)`, [pair.map((one) => one.email)])
    await pool?.end()
    await harness?.close()
  })

  it('lets one act and refuses the other, leaving an administrator in every round', async () => {
    const acts = [
      (target: string) => ({ path: `/api/accounts/${encodeURIComponent(target)}/role`, body: { role: 'analyst' } }),
      (target: string) => ({ path: `/api/accounts/${encodeURIComponent(target)}/disable`, body: undefined }),
    ]
    for (let round = 0; round < 8; round += 1) {
      await pool.query(`update "user" set role = 'admin', banned = false where email = any($1)`, [pair.map((one) => one.email)])
      expect((await administering()).sort()).toEqual(pair.map((one) => one.email).sort())
      const [a, b] = await Promise.all(pair.map((one) => signIn(harness, one.email, OWN)))
      const first = acts[round % 2]!(b!.email)
      const second = acts[Math.floor(round / 2) % 2]!(a!.email)

      const answers = await Promise.all([post(a!, first.path, first.body), post(b!, second.path, second.body)])

      expect({ round, left: (await administering()).length >= 1 }).toEqual({ round, left: true })
      expect({ round, succeeded: answers.filter((status) => status === 200).length }).toEqual({ round, succeeded: 1 })
    }
  })
})

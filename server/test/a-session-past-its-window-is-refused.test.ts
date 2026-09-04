/**
 * A session whose window has closed is refused, and a fresh one is not.
 *
 * *GIVEN a session that has been idle longer than the install permits, WHEN it
 * makes a request, THEN it is refused.*
 *
 * **Idleness is simulated by moving the expiry, not by waiting.** The window is
 * thirty minutes and `expiresAt` is exactly *last activity plus the window*, so
 * a row backdated past now is what an idle session is -- the same shape
 * `prune.test.ts` uses to age an audit line rather than sleeping through its
 * retention.
 *
 * **Both copies have to move, and that is the point rather than a chore.**
 * Sessions are held in Redis with Postgres authoritative behind them, so a test
 * that backdated only the row would be served from the cache and pass or fail
 * for the wrong reason. Deleting the cached copy is what makes the durable one
 * the answer.
 *
 * **The control takes the deletion and not the backdating.** A second session
 * has its cached copy dropped the same way and its window left open, so the
 * only difference between the two is the expiry -- without that, the refusal is
 * equally explained by the key having been dropped.
 */
import Redis from 'ioredis'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAnalyst, signIn, type Harness, type Persona } from './app-harness.js'
import { session } from '../src/db/schema/auth.js'
import { openTestPool } from './database.js'

/** `session-store.ts`'s own prefix. A key it does not use clears nothing. */
const PREFIX = 'auth:'

let harness: Harness | null = null
let expired: Persona
let fresh: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let redis: Redis | null = null

/** The token half of a cookie, which is what both stores key on. */
const tokenOf = (cookie: string) => cookie.split('=')[1]?.split('.')[0] ?? ''

const served = async (cookie: string) =>
  (await fetch(`${harness!.base}/api/cases`, { headers: { cookie } })).status

describe.skipIf(!(await bootable()))('a session left idle past the window', () => {
  beforeAll(async () => {
    harness = await boot()
    const analyst = await sharedAnalyst(harness)
    expired = await signIn(harness, analyst.email)
    fresh = await signIn(harness, analyst.email)

    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    redis = new Redis(process.env['REDIS_URL']!)
  }, 90_000)

  afterAll(async () => {
    await redis?.quit()
    await pool?.end()
    await harness?.close()
  })

  it('is served while its window is open', async () => {
    expect(await served(expired.cookie), 'the session was refused before anything was done').toBe(200)
  })

  it('is refused once the window has closed behind it', async () => {
    const db = drizzle({ client: pool! })
    const token = tokenOf(expired.cookie)
    expect(token, 'no token could be read off the cookie').not.toBe('')

    const moved = await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(session.token, token))
      .returning({ id: session.id })
    expect(moved, 'no session row was backdated, so nothing has gone idle').toHaveLength(1)

    // The cached copy carries its own expiry; leaving it makes the durable row
    // unreachable and the case vacuous.
    await redis!.del(PREFIX + token)

    expect(
      await served(expired.cookie),
      'a session whose window closed an hour ago is still being served',
    ).toBe(401)
  })

  /**
   * **The control takes the same cache deletion and not the backdating**, so
   * the only difference between the two sessions is the window. Without that,
   * the refusal above is equally explained by the key having been dropped.
   */
  it('serves a session whose cache was dropped but whose window is open', async () => {
    await redis!.del(PREFIX + tokenOf(fresh.cookie))

    expect(
      await served(fresh.cookie),
      'dropping the cached copy alone refuses a session, so the case above says nothing ' +
        'about the window',
    ).toBe(200)
  })
})

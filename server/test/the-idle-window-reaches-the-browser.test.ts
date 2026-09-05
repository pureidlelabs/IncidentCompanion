/**
 * The idle window has two clocks, and each is wound by something different.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { Redis } from 'ioredis'
import { Pool } from 'pg'

import { boot, bootable, sharedAnalyst, signIn, type Harness } from './app-harness.js'
import { SESSION_LIFETIME_CEILING_MINUTES } from '../src/policy/keys.js'

const RUNNABLE = await bootable()

/**
 * `COOKIE_CEILING_SECONDS` in `auth.config.ts`: the cookie is issued for the
 * longest lifetime an install may set, and the row carries the real window.
 */
const COOKIE_SECONDS = SESSION_LIFETIME_CEILING_MINUTES * 60

/** `PREFIX` in `session-store.ts`. */
const REDIS_PREFIX = 'auth:'

describe.skipIf(!RUNNABLE)('the idle window as the browser holds it', () => {
  let harness: Harness
  let redis: Redis
  let pool: Pool

  beforeAll(async () => {
    harness = await boot()
    redis = new Redis(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379')
    pool = new Pool({
      connectionString: process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL'],
    })
  }, 90_000)

  afterAll(async () => {
    await redis.quit()
    await pool.end()
    await harness.close()
  })

  /** A session of this file's own, and the token the row is keyed on. */
  const working = async (): Promise<{ cookie: string; name: string; token: string }> => {
    const analyst = await sharedAnalyst(harness)
    const { cookie } = await signIn(harness, analyst.email)
    const name = cookie.slice(0, cookie.indexOf('='))
    return { cookie, name, token: decodeURIComponent(cookie.slice(name.length + 1)).split('.')[0]! }
  }

  /**
   * Puts the session within five minutes of expiry, so a read that refreshes has
   * something to do.
   */
  const age = async (token: string): Promise<void> => {
    await pool.query(
      `update "session" set expires_at = now() + interval '5 minutes' where token = $1`,
      [token],
    )
    await redis.del(REDIS_PREFIX + token)
  }

  /** The durable copy's expiry, which is the clock the server enforces. */
  const expiry = async (token: string): Promise<Date> => {
    const { rows } = await pool.query<{ expires_at: Date }>(
      `select expires_at from "session" where token = $1`,
      [token],
    )
    if (!rows[0]) throw new Error('the session row is gone, so there is no window to read')
    return rows[0].expires_at
  }

  /**
   * **Every report, not one a minute.**
   */
  it("renews the browser's copy on the report itself", async () => {
    const session = await working()

    const reported = await fetch(`${harness.base}/api/auth/get-session`, {
      headers: { cookie: session.cookie },
    })
    const renewed = reported.headers.getSetCookie().find((one) => one.startsWith(`${session.name}=`))

    expect(renewed, 'the activity report answered no session cookie').toBeDefined()
    expect(renewed).toMatch(new RegExp(`Max-Age=${String(COOKIE_SECONDS)}\\b`, 'i'))
  })

  /**
   * The tab nobody is watching.
   */
  it('does not move the window for a request the analyst did not make', async () => {
    const session = await working()
    await age(session.token)
    const before = await expiry(session.token)

    const polled = await fetch(`${harness.base}/api/health`, {
      headers: { cookie: session.cookie },
    })
    expect(polled.status).toBe(200)

    expect(
      (await expiry(session.token)).getTime(),
      'the poll pushed the expiry out, so an open tab never idles out',
    ).toBe(before.getTime())
  })
})

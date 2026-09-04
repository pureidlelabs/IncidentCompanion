/**
 * The idle window has two clocks, and each is wound by something different.
 *
 * `session.expiresAt` moves on any read of the session. The `Max-Age` on the
 * session cookie moves only on a response from Better Auth's own endpoints, and
 * the Nest guard reads through `auth.api.getSession`, whose headers nobody
 * sends. Left alone the two come apart in both directions: a poll nobody is
 * watching winds the first, and an analyst at the keyboard fails to wind the
 * second - so the session outlives an abandoned tab while the browser's copy
 * dies thirty minutes after sign-in however hard somebody is working.
 *
 * The window belongs to the analyst's own input, reported by
 * `useActivityReporter`. Both tests are that one property, from its two ends.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { Redis } from 'ioredis'
import { Pool } from 'pg'

import { boot, bootable, sharedAnalyst, signIn, type Harness } from './app-harness.js'

const RUNNABLE = await bootable()

/** `IDLE_WINDOW_SECONDS` in `auth.config.ts`, which is what the cookie carries. */
const IDLE_WINDOW = 30 * 60

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
  })

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
   * Puts the session within five minutes of expiry, so a read that refreshes
   * has something to do. The Redis copy is dropped rather than rewritten: the
   * durable row is the record, and the store falls back to it.
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
   * **Every report, not one a minute.** The report is already throttled in the
   * browser, and a second throttle on the server means a keystroke arriving too
   * soon after the last one answers a response with no cookie on it - the
   * clock the browser keeps then runs out on its own.
   */
  it("renews the browser's copy on the report itself", async () => {
    const session = await working()

    const reported = await fetch(`${harness.base}/api/auth/get-session`, {
      headers: { cookie: session.cookie },
    })
    const renewed = reported.headers.getSetCookie().find((one) => one.startsWith(`${session.name}=`))

    expect(renewed, 'the activity report answered no session cookie').toBeDefined()
    expect(renewed).toMatch(new RegExp(`Max-Age=${String(IDLE_WINDOW)}\\b`, 'i'))
  })

  /**
   * The tab nobody is watching. `useBackendHealth` polls every thirty seconds
   * and keeps polling in a background tab, so a request that moved the clock
   * would leave no idle timeout at all: the abandoned tab would hold the
   * session open for as long as the browser was running.
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

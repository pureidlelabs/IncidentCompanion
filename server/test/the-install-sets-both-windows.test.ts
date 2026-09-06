/**
 * The idle window and the absolute lifetime, as the install sets them.
 *
 * Both are one number on the session row: every refresh writes the idle window
 * forward and no refresh may write it past the lifetime, so the expiry the
 * library already enforces carries both. What that buys is that nothing has to
 * remember to check the second one - the socket, the guard, the sensitive
 * routes and Redis's own TTL all read the same field.
 *
 * **The clock is moved by ageing the row, never by waiting.** A test that slept
 * for a window would be a test nobody runs.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { Redis } from 'ioredis'
import { Pool } from 'pg'

import {
  boot,
  bootable,
  sharedAdmin,
  sharedAnalyst,
  signIn,
  type Harness,
  type Persona,
} from './app-harness.js'
import {
  SESSION_IDLE_MINUTES,
  SESSION_LIFETIME_MINUTES,
  SESSION_LIFETIME_FLOOR_MINUTES,
} from '../src/policy/keys.js'

const RUNNABLE = await bootable()

/** `PREFIX` in `session-store.ts`. */
const REDIS_PREFIX = 'auth:'

/** Wide enough for a slow harness, far narrower than the windows it separates. */
const TOLERANCE_MINUTES = 2

describe.skipIf(!RUNNABLE)('the windows an install sets', () => {
  let harness: Harness
  let redis: Redis
  let pool: Pool
  let admin: Persona

  beforeAll(async () => {
    harness = await boot()
    redis = new Redis(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379')
    pool = new Pool({
      connectionString: process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL'],
    })
    admin = await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    // **Put the install back.** Every file in this tier shares one database,
    // and a policy left where a test set it is a setting the next file
    // inherits without knowing.
    await set('auth.sessionIdleMinutes', SESSION_IDLE_MINUTES)
    await set('auth.sessionLifetimeMinutes', SESSION_LIFETIME_MINUTES)
    await redis.quit()
    await pool.end()
    await harness.close()
  })

  /** Through the route an administrator uses, so this covers the door as well. */
  const set = async (key: string, value: number): Promise<void> => {
    const response = await fetch(`${harness.base}/api/install/policy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ key, value }),
    })
    if (!response.ok) {
      throw new Error(`setting ${key} answered ${response.status}: ${await response.text()}`)
    }
  }

  /** A session of this file's own, and the token its row is keyed on. */
  const working = async (): Promise<{ cookie: string; token: string }> => {
    const analyst = await sharedAnalyst(harness)
    const { cookie } = await signIn(harness, analyst.email)
    const name = cookie.slice(0, cookie.indexOf('='))
    return { cookie, token: decodeURIComponent(cookie.slice(name.length + 1)).split('.')[0]! }
  }

  /**
   * Moves when the session began, and drops the Redis copy so the aged row is
   * what the next read answers from.
   */
  const began = async (token: string, minutesAgo: number): Promise<void> => {
    await pool.query(
      `update "session" set created_at = now() - make_interval(mins => $2) where token = $1`,
      [token, minutesAgo],
    )
    await redis.del(REDIS_PREFIX + token)
  }

  /**
   * How far ahead the durable copy's expiry stands, in minutes.
   *
   * **Subtracted in SQL.** `expires_at` is a timestamp without a zone, so
   * `pg` hands it back read as the *client's* local time - which is the
   * machine's offset from UTC subtracted from every window this file measures.
   */
  const windowAhead = async (token: string): Promise<number> => {
    const { rows } = await pool.query<{ minutes: string }>(
      `select extract(epoch from (expires_at - now())) / 60 as minutes
         from "session" where token = $1`,
      [token],
    )
    if (!rows[0]) throw new Error('the session row is gone, so there is no window to read')
    return Number(rows[0].minutes)
  }

  /** What the browser reports, which is the one read that refreshes. */
  const report = (cookie: string): Promise<Response> =>
    fetch(`${harness.base}/api/auth/get-session`, { headers: { cookie } })

  it('signs a session in for the idle window the install set, not a compiled one', async () => {
    const asked = 45
    expect(asked, 'the value under test is the default, so this proves nothing').not.toBe(
      SESSION_IDLE_MINUTES,
    )
    await set('auth.sessionIdleMinutes', asked)

    const session = await working()

    expect(await windowAhead(session.token)).toBeGreaterThan(asked - TOLERANCE_MINUTES)
    expect(await windowAhead(session.token)).toBeLessThan(asked + TOLERANCE_MINUTES)
  })

  /**
   * **The cached copy expires with the session, not with the cookie.** Better
   * Auth computes the Redis TTL from the expiry it proposed rather than from
   * the one written, so a window shorter than `expiresIn` - which every window
   * an install can set now is - would leave the key behind for the whole
   * ceiling. It is not a way in: the JSON carries the real expiry and the route
   * refuses on it. It is a dead key held for a day instead of half an hour.
   */
  it('does not leave the cached copy behind after the session it holds', async () => {
    await set('auth.sessionIdleMinutes', SESSION_IDLE_MINUTES)
    const session = await working()

    const ttl = await redis.ttl(REDIS_PREFIX + session.token)
    const ahead = await windowAhead(session.token)

    expect(ttl, 'the cached session has no expiry at all').toBeGreaterThan(0)
    expect(ttl / 60, 'the cache outlives the session it holds').toBeLessThan(
      ahead + TOLERANCE_MINUTES,
    )
  })

  it('will not let a busy session refresh its way past the lifetime', async () => {
    await set('auth.sessionIdleMinutes', SESSION_IDLE_MINUTES)
    await set('auth.sessionLifetimeMinutes', SESSION_LIFETIME_FLOOR_MINUTES)

    const session = await working()
    const left = 5
    await began(session.token, SESSION_LIFETIME_FLOOR_MINUTES - left)

    expect((await report(session.cookie)).status).toBe(200)

    const ahead = await windowAhead(session.token)
    expect(ahead, 'the refresh wrote the idle window and ignored the lifetime').toBeLessThan(
      left + TOLERANCE_MINUTES,
    )
    expect(ahead, 'the session was cut short of the lifetime it was owed').toBeGreaterThan(
      left - TOLERANCE_MINUTES,
    )
  })

  it('refuses a session that has reached the lifetime, however busy it is', async () => {
    await set('auth.sessionIdleMinutes', SESSION_IDLE_MINUTES)
    await set('auth.sessionLifetimeMinutes', SESSION_LIFETIME_FLOOR_MINUTES)

    const session = await working()
    await began(session.token, SESSION_LIFETIME_FLOOR_MINUTES + 1)

    // Still working: the report is what an analyst at the keyboard sends, and
    // it is the request that would otherwise push the window out again.
    await report(session.cookie)

    const asked = await fetch(`${harness.base}/api/cases`, {
      headers: { cookie: session.cookie },
    })
    expect(asked.status, 'a session past its lifetime still reaches the app').toBe(401)
  })
})

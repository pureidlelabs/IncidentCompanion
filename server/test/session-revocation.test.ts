/**
 * What a revoked session can still do while Redis has not caught up.
 *
 * The window this covers is Postgres losing the row while the Redis key
 * survives -- what `deleteCachedUserSessions` leaves behind when its read of
 * `active-sessions-<userId>` fails soft. Deleting the *Redis* copy instead
 * measures the Postgres fallback and cannot see this at all, which is the
 * mistake that put a false safety clause in `session-store.ts` for one commit.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { Redis } from 'ioredis'
import { Pool } from 'pg'

import { boot, bootable, sharedAnalyst, type Harness, type Persona } from './app-harness.js'

const RUNNABLE = await bootable()

describe.skipIf(!RUNNABLE)('a session revoked in Postgres but still in Redis', () => {
  let harness: Harness
  let doomed: Persona
  let redis: Redis
  let pool: Pool

  const ordinary = async (): Promise<number> => {
    const response = await fetch(`${harness.base}/api/auth/get-session`, {
      headers: { cookie: doomed.cookie },
    })
    // `null` on a 200 is what an unauthenticated caller gets, so the status
    // alone would pass for a session that was refused.
    const body = (await response.json()) as unknown
    return body ? response.status : 401
  }

  /**
   * Deliberately the wrong current password: 400 means the session was
   * accepted and only the password refused, 401 means the session itself was
   * refused. Neither branch mutates the account.
   */
  const sensitive = async (): Promise<number> => {
    const response = await fetch(`${harness.base}/api/auth/change-password`, {
      method: 'POST',
      headers: { cookie: doomed.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'definitely-not-it', newPassword: 'x'.repeat(20) }),
    })
    return response.status
  }

  beforeAll(async () => {
    harness = await boot()
    // Sign-up is closed on a provisioned install, so this borrows the shared
    // analyst -- but revokes only the row belonging to *this* cookie, never
    // every session of that account, which a parallel file is also holding.
    doomed = await sharedAnalyst(harness)
    redis = new Redis(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379')
    pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
  }, 90_000)

  afterAll(async () => {
    await redis.quit()
    await pool.end()
    await harness.close()
  })

  it('is still accepted by the sensitive routes, not only the ordinary ones', async () => {
    expect(await ordinary(), 'the fresh session was refused, so nothing below means anything').toBe(
      200,
    )
    expect(await sensitive()).toBe(400)

    const keysBefore = await redis.keys('auth:*')
    // The cookie carries `<token>.<signature>`; the row is keyed on the token.
    const token = decodeURIComponent(doomed.cookie.split('=')[1] ?? '').split('.')[0]
    const revoked = await pool.query('DELETE FROM "session" WHERE token = $1', [token])
    expect(
      revoked.rowCount,
      'no row was revoked -- the cookie no longer spells `<token>.<signature>`, ' +
        'so everything below is asserting against an untouched session',
    ).toBe(1)

    // The point of the test: Redis still holds what Postgres just lost.
    expect(await redis.keys('auth:*')).toHaveLength(keysBefore.length)

    expect(
      await ordinary(),
      'the session read stopped refreshing, so a revoked row is served from ' +
        'Redis again and the window has reopened on this route',
    ).toBe(401)

    expect(
      await sensitive(),
      'the sensitive route accepted a session whose row is gone, so the ' +
        'window has reopened where a password can be changed',
    ).toBe(401)

    /**
     * **The route above is Better Auth's; this one sits behind the app's global
     * guard, which delegates to the same `getSession` -- so it pins the route
     * table rather than a second mechanism.**
     */
    const anonymous = await fetch(`${harness.base}/api/demos`)
    expect(anonymous.status, 'the route is open, so 200 below proves nothing').toBe(401)

    const guarded = await fetch(`${harness.base}/api/demos`, {
      headers: { cookie: doomed.cookie },
    })
    expect(
      guarded.status,
      'the Nest guard refuses a session revoked in Postgres, so the window ' +
        'stops at Better Auth and does not reach the app routes',
    ).toBe(200)
  })
})

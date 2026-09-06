/**
 * The store's degradation, which the booted tier cannot reach.
 *
 * `session-revocation-through-the-endpoints.test.ts` proves the index is
 * rebuilt by deleting the key under a live stack. What it cannot do is make
 * *Postgres* fail on demand, and that is the half where a fix to a revocation
 * hole could turn one degraded store into "nobody can sign in".
 */
import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { redisSessionStore, type ActiveSessionLookup } from './session-store.js'

const redisThat = (get: () => Promise<string | null>) =>
  ({
    get,
    set: vi.fn(),
    del: vi.fn(),
    getdel: vi.fn(),
  }) as never

const quiet = new Logger('test')
quiet.warn = vi.fn()

const INDEX = 'active-sessions-analyst-1'

describe('the session index when Redis cannot answer', () => {
  it('is rebuilt from the durable copy', async () => {
    const lookup: ActiveSessionLookup = async () => [
      { token: 'later', expiresAt: 2_000 },
      { token: 'sooner', expiresAt: 1_000 },
    ]
    const store = redisSessionStore(redisThat(async () => null), quiet, undefined, lookup)

    const answer = await store.get(INDEX)

    // Ascending by expiry: `deleteCachedUserSessions` takes `.at(-1)` as the
    // furthest expiry when it rewrites the key, so the order is load-bearing
    // rather than cosmetic.
    expect(JSON.parse(answer as string)).toEqual([
      { token: 'sooner', expiresAt: 1_000 },
      { token: 'later', expiresAt: 2_000 },
    ])
  })

  it('answers null rather than throwing when the database is down too', async () => {
    /**
     * **The property that must survive this fix.** Every call in this store
     * fails soft so that losing Redis costs a slow request instead of a locked
     * install. A rebuild that propagates a Postgres error would make a *second*
     * outage worse than the first, and it would do it inside Better Auth's own
     * call stack, where the failure surfaces as a 500 on every guarded route.
     */
    const store = redisSessionStore(
      redisThat(async () => null),
      quiet,
      undefined,
      async () => {
        throw new Error('the database is unreachable')
      },
    )

    await expect(store.get(INDEX)).resolves.toBeNull()
  })

  it('answers null for a user with no live sessions', async () => {
    // Not an empty array: `getActiveSessionReferences` reads
    // `activeSessions ? parse : []`, so `"[]"` and `null` mean the same thing
    // to it -- and null is what a genuinely absent key looks like.
    const store = redisSessionStore(redisThat(async () => null), quiet, undefined, async () => [])

    await expect(store.get(INDEX)).resolves.toBeNull()
  })

  it('does not rebuild a key that is not the index', async () => {
    /**
     * The blanket-rule trap: a `set` that caps every key cannot tell them apart.
     * This one reads the key it was given, so a session token that genuinely is
     * not in Redis stays a miss and falls through to the library's own
     * `findSession` path.
     */
    const lookup = vi.fn(async () => [{ token: 'a', expiresAt: 1 }])
    const store = redisSessionStore(redisThat(async () => null), quiet, undefined, lookup)

    await expect(store.get('some-session-token')).resolves.toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('leaves a cached index alone', async () => {
    const lookup = vi.fn(async () => [])
    const store = redisSessionStore(redisThat(async () => '[{"token":"x","expiresAt":9}]'), quiet, undefined, lookup)

    await expect(store.get(INDEX)).resolves.toBe('[{"token":"x","expiresAt":9}]')
    expect(lookup).not.toHaveBeenCalled()
  })
})

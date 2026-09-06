/**
 * Sessions read from Redis, and survive it being emptied.
 *
 * **The claim this exists to prove is a fallback, and a fallback is invisible
 * when everything works.** With `secondaryStorage` configured, a signed-in
 * analyst is served from Redis; the question is what happens when Redis loses
 * the key. Reading the library says one thing -- `storeSessionInDatabase` gates
 * a fall-through to the adapter -- and the only way to know it is wired
 * correctly *here* is to empty Redis under a live session and make a request.
 *
 * **Emptying is done by key, never `FLUSHDB`.** This worktree's Redis is shared
 * with presence, claims and the prose relay, and the suite runs files
 * concurrently; flushing the database would fail other tests in a way that
 * looks like their own defect.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { Redis } from 'ioredis'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const RUNNABLE = await bootable()

describe.skipIf(!RUNNABLE)('a session held in Redis', () => {
  let harness: Harness
  let admin: Persona
  let redis: Redis

  const whoAmI = async (): Promise<number> => {
    const response = await fetch(`${harness.base}/api/auth/get-session`, {
      headers: { cookie: admin.cookie },
    })
    // The body is `null` for an unauthenticated caller on a 200, so the status
    // alone would pass for a signed-out analyst.
    const body = (await response.json()) as unknown
    return body ? response.status : 401
  }

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    redis = new Redis(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379')
  }, 90_000)

  afterAll(async () => {
    await redis.quit()
    await harness.close()
  })

  it('writes the session into Redis under its own prefix', async () => {
    // A request first: the session is written when it is created or refreshed,
    // and asserting on an empty keyspace would prove only that nothing ran.
    expect(await whoAmI()).toBe(200)

    const keys = await redis.keys('auth:*')
    expect(
      keys.length,
      'no auth-prefixed key exists, so secondaryStorage is not wired and every ' +
        'lookup is still hitting Postgres',
    ).toBeGreaterThan(0)
  })

  it('still authenticates after Redis loses every session key', async () => {
    expect(await whoAmI()).toBe(200)

    const keys = await redis.keys('auth:*')
    expect(keys.length).toBeGreaterThan(0)
    await redis.del(...keys)
    expect(await redis.keys('auth:*')).toHaveLength(0)

    /**
     * **This is the whole test.** Without `storeSessionInDatabase: true` the
     * library returns null on a secondary-storage miss and the analyst is
     * signed out by a cache eviction. With it, the lookup falls through to
     * Postgres and the session is still there.
     */
    expect(
      await whoAmI(),
      'the session vanished with the Redis key, so Redis is the record rather ' +
        'than the cache -- a restart would sign out every analyst',
    ).toBe(200)
  })

  it('does not repopulate Redis on the fallback read', async () => {
    /**
     * The fallback *reads* Postgres, it does not write the session back. So
     * after an eviction every
     * request pays a database lookup until the session is written again through
     * the ordinary path. If this ever starts failing, the library gained
     * fill-on-miss and the cost model in `session-store.ts` is wrong.
     */
    const keys = await redis.keys('auth:*')
    if (keys.length > 0) await redis.del(...keys)

    expect(await whoAmI()).toBe(200)
    expect(await redis.keys('auth:*')).toHaveLength(0)
  })
})

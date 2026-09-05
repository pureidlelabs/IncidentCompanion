/**
 * Sessions read from Redis, and survive it being emptied.
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
     * **This is the whole test.**
     */
    expect(
      await whoAmI(),
      'the session vanished with the Redis key, so Redis is the record rather ' +
        'than the cache -- a restart would sign out every analyst',
    ).toBe(200)
  })

  it('does not repopulate Redis on the fallback read', async () => {
    /**
     * Recorded because it is the half that surprises: the fallback *reads*
     * Postgres, it does not write the session back.
     */
    const keys = await redis.keys('auth:*')
    if (keys.length > 0) await redis.del(...keys)

    expect(await whoAmI()).toBe(200)
    expect(await redis.keys('auth:*')).toHaveLength(0)
  })
})

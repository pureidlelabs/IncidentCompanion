/**
 * The counter, including the two ways it was wrong.
 */
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { redisCounter } from './rate-limit.js'

const URL = process.env['REDIS_URL']

describe.skipIf(!URL)('the rate limit counter', () => {
  let redis: Redis

  beforeAll(async () => {
    redis = new Redis(URL!, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
    /**
     * **Waited for, and the wait is itself a finding.**
     */
    // The event, not a command: `ping()` is itself a command and rejects for
    // the very reason being waited out.
    if (redis.status !== 'ready') await new Promise((done) => redis.once('ready', done))
  })

  afterAll(async () => {
    redis.disconnect()
  })

  /** A distinct bucket per test: the counter is keyed and these run together. */
  const bucket = (name: string): string => `test-${name}-${String(process.pid)}`

  it('counts upward within a window', async () => {
    const counter = redisCounter(redis)
    const key = bucket('counts')

    expect(await counter.increment(key, 60)).toBe(1)
    expect(await counter.increment(key, 60)).toBe(2)
    expect(await counter.increment(key, 60)).toBe(3)
  })

  it('gives the window an expiry that later increments do not extend', async () => {
    /**
     * **The immortal-key defect, asserted.**
     */
    const counter = redisCounter(redis)
    const key = bucket('expiry')

    await counter.increment(key, 30)
    const first = await redis.ttl(`authrl:${key}`)
    expect(first, 'the counter has no expiry, so its window never closes').toBeGreaterThan(0)

    /**
     * **The wait is the test.**
     */
    await new Promise((done) => setTimeout(done, 3000))

    await counter.increment(key, 30)
    const second = await redis.ttl(`authrl:${key}`)
    expect(
      second,
      'the window was extended by a later increment, so a caller can hold it ' +
        'open by staying over the limit',
    ).toBeLessThan(first)
  }, 15_000)

  it('gives each window its own limiter, so a rule gets the window it asked for', async () => {
    /**
     * **One limiter per duration, because the duration arrives per call.**
     */
    const counter = redisCounter(redis)
    const brief = bucket('brief')
    const long = bucket('long')

    await counter.increment(brief, 30)
    await counter.increment(long, 600)

    const briefTtl = await redis.ttl(`authrl:${brief}`)
    const longTtl = await redis.ttl(`authrl:${long}`)

    expect(briefTtl).toBeGreaterThan(0)
    expect(briefTtl).toBeLessThanOrEqual(30)
    expect(longTtl, 'both windows landed on the same duration, so the limiters are shared').toBeGreaterThan(60)
  })

  it('keeps counting when the store is unreachable', async () => {
    /**
     * **This is the assertion the bypass would have failed, and it is not the one
     * written first.**
     */
    const dead = new Redis(1, '127.0.0.1', {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
      lazyConnect: true,
    })
    dead.on('error', () => {})

    try {
      const counter = redisCounter(dead)
      const key = bucket('dead')

      const seen = [
        await counter.increment(key, 10),
        await counter.increment(key, 10),
        await counter.increment(key, 10),
      ]

      expect(
        seen,
        'the counter did not climb while its store was unreachable, so a rate ' +
          'limiter reading these would allow every attempt -- a bypass rather ' +
          'than a fallback',
      ).toEqual([1, 2, 3])
    } finally {
      dead.disconnect()
    }
  })
})

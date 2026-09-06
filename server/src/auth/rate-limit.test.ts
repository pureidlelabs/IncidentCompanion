/**
 * The counter, and the two shapes that make it wrong in silence.
 *
 * **Nothing else holds this path.** Mutating `increment` to return `0`
 * unconditionally -- a total rate-limit bypass -- leaves the whole server suite
 * green, identical to a clean run. These are the assertions that go red.
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
     * **Waited for, and the wait is itself a finding.** With
     * `enableOfflineQueue: false` every command issued before the socket is
     * ready rejects at once, so the insurance limiter answers and nothing
     * reaches Redis. Asserting on Redis keys without waiting finds none, which
     * reads as the store being unwired rather than as the boot window.
     *
     * The same window exists in the server: counting is in-memory until the
     * connection is up. Safe, because insurance still counts, and worth
     * knowing, because Redis-backed counting does not begin at t=0.
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
     * **The immortal-key defect, asserted.** Hand-rolled, this is `INCR` then
     * `EXPIRE` guarded by `if (count === 1)`: a failure between the two leaves a
     * key with no TTL that no later call repairs, and because `getIP` returns
     * null in this configuration every caller shares one bucket -- so one blip
     * plus four sign-in attempts locks out the whole install until somebody runs
     * `DEL`. The library does both in one Lua script.
     */
    const counter = redisCounter(redis)
    const key = bucket('expiry')

    await counter.increment(key, 30)
    const first = await redis.ttl(`authrl:${key}`)
    expect(first, 'the counter has no expiry, so its window never closes').toBeGreaterThan(0)

    /**
     * **The wait is the test.** Sampling both TTLs inside the same second
     * compares 30 to 30, which a *sliding* counter passes just as happily --
     * proved by building one (`INCR` then unconditional `EXPIRE`, the defect
     * this names) and running the old assertion against it: it went green.
     * With time between the samples the window must have shrunk, so an
     * extension is visible.
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
     * Better Auth passes each rule's TTL to `increment` while the library takes
     * `duration` at construction; sharing one limiter would give every rule
     * whichever window was constructed first -- a ten-second sign-in rule
     * silently running on a ten-minute window, or the reverse.
     *
     * **Asserted across two keys, not one.** A single key gets its expiry when
     * it is created and later calls do not extend it, so writing both windows
     * to the same key would prove only which ran first. Better Auth's keys
     * embed the path, so one key never carries two windows in practice.
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
     * **This is the assertion the bypass would have failed, and it is not the
     * one written first.** Better Auth's check is `increment(...) <= rule.max`,
     * so any small *constant* means "allowed". The first implementation
     * returned `0` on error -- under every maximum -- so a Redis error did not
     * relax the limit, it removed it, and with `enableOfflineQueue: false` that
     * included a window on every server start.
     *
     * **Demanding a huge number here is wrong.** It gets `1`, because
     * `insuranceLimiter` has taken over and counts in memory -- the designed
     * behaviour, not a failure.
     * Fail-closed is the last resort, reached only when the in-memory limiter
     * fails too; what the outage path actually owes is that counting
     * *continues*. So the property is that the number climbs, not that it is
     * large.
     *
     * **What this does not assert is the accuracy of that count.** Insurance
     * counts per-instance and hands nothing over when Redis returns.
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

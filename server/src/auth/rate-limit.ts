/**
 * The counter behind Better Auth's rate limiter.
 *
 * Better Auth asks for `increment(key, ttl) -> count` and compares the answer
 * to the rule's maximum itself, so all this owes is a correct count - and any
 * number it invents on failure is a change to the limit. It must fail closed,
 * and it must not extend a window it has already opened; `rate-limiter-flexible`
 * carries both, an in-memory `insuranceLimiter` covering a Redis outage.
 *
 * **Bounding `NEVER_REJECTS` makes the `catch` below live**, and the value it
 * returns is then wrong.
 */
import { Logger } from '@nestjs/common'
import type { Redis } from 'ioredis'
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible'

/**
 * **A counter, not an enforcer.** The library can reject over its own limit;
 * here it must never do that, because the decision is Better Auth's and a
 * rejection would be indistinguishable from a store failure. Points are set
 * past any real count so `consume` always resolves and the number it carries
 * is the answer.
 */
const NEVER_REJECTS = Number.MAX_SAFE_INTEGER

/** Kept off the session keys, which share this Redis. */
const KEY_PREFIX = 'authrl'

export interface Counter {
  increment(key: string, ttl: number): Promise<number>
}

export function redisCounter(redis: Redis, log = new Logger('RateLimit')): Counter {
  /**
   * **One limiter per window, because the window arrives per call.** Better
   * Auth passes each rule's TTL to `increment`, while the library takes
   * `duration` at construction -- sign-in is 10s, others differ. Sharing one
   * limiter across windows would give every rule whichever duration was
   * constructed first.
   */
  const byWindow = new Map<number, RateLimiterRedis>()

  const limiterFor = (ttl: number): RateLimiterRedis => {
    let limiter = byWindow.get(ttl)
    if (!limiter) {
      limiter = new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: KEY_PREFIX,
        points: NEVER_REJECTS,
        duration: ttl,
        // Takes over when the Redis store errors, which is what stops a
        // failure becoming a count of zero.
        insuranceLimiter: new RateLimiterMemory({ points: NEVER_REJECTS, duration: ttl }),
      })
      byWindow.set(ttl, limiter)
    }
    return limiter
  }

  return {
    async increment(key, ttl) {
      try {
        const result = await limiterFor(ttl).consume(key, 1)
        return result.consumedPoints
      } catch (error) {
        /**
         * **Fails closed**: reaching here means both the store and the
         * in-memory insurance failed, so nothing can know whether this caller
         * is over the limit, and any number below the maximum would allow the
         * request. Unreachable while `NEVER_REJECTS` is `MAX_SAFE_INTEGER`, and
         * no test isolates it - replacing this line with `return 0`, the
         * original bypass, leaves all four tests in `rate-limit.test.ts` green.
         */
        log.error(
          `rate limit counter failed for a ${String(ttl)}s window, denying: ${String(error)}`,
        )
        return NEVER_REJECTS
      }
    },
  }
}

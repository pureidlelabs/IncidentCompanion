/**
 * The counter behind Better Auth's rate limiter.
 */
import { Logger } from '@nestjs/common'
import type { Redis } from 'ioredis'
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible'

/**
 * **A counter, not an enforcer.**
 */
const NEVER_REJECTS = Number.MAX_SAFE_INTEGER

/** Kept off the session keys, which share this Redis. */
const KEY_PREFIX = 'authrl'

export interface Counter {
  increment(key: string, ttl: number): Promise<number>
}

export function redisCounter(redis: Redis, log = new Logger('RateLimit')): Counter {
  /**
   * **One limiter per window, because the window arrives per call.**
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
         * **Fails closed**: reaching here means both the store and the in-memory
         * insurance failed, so nothing can know whether this caller is over the limit,
         * and any number below the maximum would allow the request.
         */
        log.error(
          `rate limit counter failed for a ${String(ttl)}s window, denying: ${String(error)}`,
        )
        return NEVER_REJECTS
      }
    },
  }
}

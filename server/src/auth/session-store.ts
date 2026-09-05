/**
 * Sessions in Redis, with Postgres underneath as the durable copy.
 */
import { Logger } from '@nestjs/common'
import type { SecondaryStorage } from 'better-auth'
import type { Redis } from 'ioredis'

import { redisCounter, type Counter } from './rate-limit.js'

/**
 * One row of the index Better Auth keeps for a user's live sessions.
 */
export interface SessionReference {
  token: string
  /** Milliseconds since the epoch, which is what the library compares against. */
  expiresAt: number
}

/** Reads a user's unexpired sessions from the durable copy. */
export type ActiveSessionLookup = (userId: string) => Promise<SessionReference[]>

/** `active-sessions-<userId>`, the one key that is an index rather than a cache. */
const ACTIVE_SESSIONS = 'active-sessions-'

/**
 * **Namespaced, because this Redis is shared.**
 */
const PREFIX = 'auth:'

export function redisSessionStore(
  redis: Redis,
  log = new Logger('SessionStore'),
  counter: Counter = redisCounter(redis),
  activeSessions?: ActiveSessionLookup,
): SecondaryStorage {
  /**
   * One place for the degradation, so no call site can forget it.
   */
  const soft = async <T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run()
    } catch (error) {
      log.warn(`redis ${what} failed, falling back to the database: ${String(error)}`)
      return fallback
    }
  }

  return {
    /**
     * Reads a key from Redis, and rebuilds one of them from Postgres on a miss.
     */
    get: async (key) => {
      const cached = await soft('get', async () => await redis.get(PREFIX + key), null)
      if (cached !== null || !activeSessions || !key.startsWith(ACTIVE_SESSIONS)) return cached

      const userId = key.slice(ACTIVE_SESSIONS.length)
      return soft('rebuild the session index', async () => {
        const live = await activeSessions(userId)
        if (live.length === 0) return null
        // Ascending by expiry, which is the order the library writes and the
        // order `deleteCachedUserSessions` assumes when it takes `.at(-1)`.
        const sorted = [...live].sort((a, b) => a.expiresAt - b.expiresAt)
        log.warn(
          `rebuilt the session index for ${userId} from the database: ` +
            `${String(sorted.length)} live session(s). Redis did not have it.`,
        )
        return JSON.stringify(sorted)
      }, null)
    },

    /**
     * **`GETDEL`, because the contract says atomically.**
     */
    getAndDelete: (key) => soft('getAndDelete', async () => await redis.getdel(PREFIX + key), null),

    /**
     * **Not `soft()`, and not hand-rolled.**
     */
    increment: (key, ttl) => counter.increment(key, ttl),

    /**
     * **`EX` only when a TTL is given.**
     */
    set: (key, value, ttl) =>
      soft(
        'set',
        async () => {
          if (ttl && ttl > 0) await redis.set(PREFIX + key, value, 'EX', ttl)
          else await redis.set(PREFIX + key, value)
        },
        undefined,
      ),

    /**
     * **A failed delete leaves a revoked session readable until its own TTL**,
     * bounded at `IDLE_WINDOW_SECONDS`, and every guarded route is inside that
     * window.
     */
    delete: (key) => soft('delete', async () => void (await redis.del(PREFIX + key)), undefined),
  }
}

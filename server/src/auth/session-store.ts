/**
 * Sessions in Redis, with Postgres underneath as the durable copy.
 *
 * **Redis is the fast path, never the record.** Every authenticated request
 * looks a session up, which through `drizzleAdapter` alone is a Postgres query
 * per request; `secondaryStorage` answers it from Redis instead.
 *
 * **`storeSessionInDatabase: true` in `auth.config.ts` is what keeps the row in
 * Postgres and makes the fallback exist.** `preserveSessionInDatabase` sits in
 * the same condition in the library and switches the fallback back off, so
 * setting both gives durability with no fallback - the worst pair available.
 *
 * **The fallback reads; it does not repopulate.** After Redis is emptied every
 * request pays a Postgres lookup until sessions are written again through the
 * ordinary path.
 *
 * **Every call here fails soft, and `increment` is the exception that is not
 * in this file.** A swallowed failure costs a slow path everywhere else; on
 * the rate limiter it is a bypass, so that one lives in `rate-limit.ts` and
 * fails closed.
 */
import { Logger } from '@nestjs/common'
import type { SecondaryStorage } from 'better-auth'
import type { Redis } from 'ioredis'

import { redisCounter, type Counter } from './rate-limit.js'

/**
 * One row of the index Better Auth keeps for a user's live sessions.
 *
 * The shape is the library's, not ours: `getActiveSessionReferences` parses
 * this JSON and `deleteCachedUserSessions` reads `.token` off each entry.
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
 * **Namespaced, because this Redis is shared.** Presence, claims and the prose
 * relay use the same instance; an un-prefixed key could collide with a case id,
 * and a sweep aimed at presence would sign everyone out.
 */
const PREFIX = 'auth:'

export function redisSessionStore(
  redis: Redis,
  log = new Logger('SessionStore'),
  counter: Counter = redisCounter(redis),
  activeSessions?: ActiveSessionLookup,
): SecondaryStorage {
  /**
   * One place for the degradation, so no call site can forget it. A miss and a
   * failure are deliberately indistinguishable to the caller: both mean "not in
   * Redis", and Better Auth then reads Postgres.
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
     *
     * **`active-sessions-<userId>` is an index, not a cache entry.**
     * `getActiveSessionReferences` has no `storeSessionInDatabase`
     * fall-through, so a missing key reads as *"this user has no other
     * sessions"* and a revoke-all then reports success having revoked nothing.
     * Hence the rebuild, from the `activeSessions` lookup the module supplies.
     *
     * **It covers losing the index, not losing the keyspace.** `listSessions`
     * reads the index and then reads each token out of this store, so after a
     * Redis restart the index rebuilds and every token still misses.
     *
     * **Still fails soft**: if Postgres cannot answer either, this returns
     * `null` rather than throwing.
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
     * **`GETDEL`, because the contract says atomically.** A `get` followed by a
     * `del` is two round trips with a window between them, and this backs
     * single-use tokens -- two callers could both read the value before either
     * deleted it.
     */
    getAndDelete: (key) => soft('getAndDelete', async () => await redis.getdel(PREFIX + key), null),

    /**
     * **Not `soft()`, and not hand-rolled.** This one backs the rate limiter,
     * where both halves of the pattern used here are wrong: `INCR` then
     * `EXPIRE` leaves a window in which a failure brands the key immortal, and
     * a fallback value below the rule's maximum removes the limit rather than
     * relaxing it. `rate-limit.ts` carries the whole argument.
     */
    increment: (key, ttl) => counter.increment(key, ttl),

    /**
     * **`EX` only when a TTL is given.** Better Auth passes the session's
     * remaining lifetime in seconds; a `set` without one would leave a key that
     * outlives the session it describes, and Redis has no volume here to expire
     * it on a restart.
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
     * window. The Postgres row is gone either way, so this warns rather than
     * throwing. Single sign-out is unaffected: `deleteSession` calls `delete`
     * outside its `if (data)` block.
     *
     * **`isStateful()` does not protect the sensitive routes**, which is the
     * assumption worth naming: it governs the *cookie* cache, and
     * `getAuthoritativeSessionFromCtx` still consults this store first - so a
     * password change is in the window along with everything behind the Nest
     * guard. `session-revocation.test.ts` revokes in Postgres and covers it;
     * `session-cache.test.ts` deletes the Redis copy instead and is
     * structurally blind to it.
     */
    delete: (key) => soft('delete', async () => void (await redis.del(PREFIX + key)), undefined),
  }
}

/**
 * Whether this server can reach Postgres and Redis, said in words a stranger
 * may read.
 *
 * Maps every failure onto one of `SAFE_REASONS` and drops the driver's own
 * text, and gives each probe a timeout - a dependency that accepts and never
 * answers is the one that hangs the endpoint.
 */
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus'
import type { Pool } from 'pg'

import { PG_POOL } from '../db/db.module.js'
import { HEALTH_REDIS, type RedisProbe } from './health.redis.js'

/**
 * How long a dependency has to answer.
 *
 * **Two seconds, and it is a diagnostic rather than a timeout budget.** The
 * question is "is this reachable", so a dependency taking longer than this is
 * already failing the analyst whatever it eventually says.
 */
export const PING_BUDGET_MS = 2000

/**
 * Everything a failed probe is allowed to say.
 *
 * **Closed on purpose.** The list is the guarantee: no string built from a
 * driver's message can appear here, so no host, port, database name or
 * password can reach an unauthenticated caller by way of an error nobody
 * anticipated.
 */
export const SAFE_REASONS = [
  'timed out',
  'refused the connection',
  'host not found',
  'connection reset',
  'rejected the credentials',
  'the database does not exist',
  'unavailable',
] as const

export type SafeReason = (typeof SAFE_REASONS)[number]

/**
 * Codes worth telling apart, and safe to key on.
 *
 * A libuv errno and a Postgres SQLSTATE are both fixed vocabularies defined by
 * something other than this deployment, so reading one quotes nothing an
 * operator configured. That is what makes "rejected the credentials" - a wrong
 * password - distinguishable from "refused the connection" - nothing
 * listening - without either answer naming the server involved.
 */
const BY_CODE: Record<string, SafeReason> = {
  ETIMEDOUT: 'timed out',
  ECONNREFUSED: 'refused the connection',
  ENOTFOUND: 'host not found',
  EAI_AGAIN: 'host not found',
  ECONNRESET: 'connection reset',
  EPIPE: 'connection reset',
  '28P01': 'rejected the credentials',
  '28000': 'rejected the credentials',
  '3D000': 'the database does not exist',
}

/**
 * What a public caller is told about a failure, and never the driver's text.
 *
 * **Variadic, because the rejection is not always the thing that knows.**
 * ioredis rejects a ping to a stopped server with a `MaxRetriesPerRequestError`
 * carrying no own properties at all, while the `ECONNREFUSED` it is really
 * about was emitted on the client's `error` event. The first candidate that
 * carries a code this list recognises wins; if none does, the answer is the
 * vaguest one rather than anything read off a message.
 */
export function reason(...candidates: unknown[]): SafeReason {
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown } | null)?.code
    if (typeof code === 'string' && code in BY_CODE) return BY_CODE[code]!
  }
  return 'unavailable'
}

/** Thrown when a dependency accepted the work and never came back. */
class Stalled extends Error {
  readonly code = 'ETIMEDOUT'

  constructor(ms: number) {
    super(`no answer within ${ms}ms`)
  }
}

/**
 * `work`, or a rejection once `ms` has passed.
 *
 * **The timer is always cleared.** An armed timer keeps Node's event loop
 * alive, so one left behind per probe is a process that will not exit on
 * `SIGTERM` - a defect no assertion about the response body can see.
 */
export async function withinBudget<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { reject(new Stalled(ms)) }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

@Injectable()
export class PostgresHealth {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly indicators: HealthIndicatorService,
  ) {}

  /**
   * **`select 1`, through the pool the app itself serves from.**
   *
   * A constant rather than a table: a probe holds no case scope, so anything
   * under row-level security answers zero rows whether or not the database is
   * well, and a table read would additionally fail on an install with no data
   * in it. Going through the shared pool is the point - a pool with no free
   * connection is an application that cannot serve, and a probe opening its
   * own connection would report that as healthy.
   */
  async check(): Promise<HealthIndicatorResult> {
    const session = this.indicators.check('postgres')
    try {
      await withinBudget(this.pool.query('select 1'), PING_BUDGET_MS)
      return session.up()
    } catch (error) {
      return session.down(reason(error))
    }
  }
}

@Injectable()
export class RedisHealth implements OnApplicationShutdown {
  constructor(
    @Inject(HEALTH_REDIS) private readonly redis: RedisProbe,
    private readonly indicators: HealthIndicatorService,
  ) {}

  /**
   * **A `PONG` and nothing else counts as up.**
   *
   * Treating "it did not throw" as healthy is how a probe certifies a
   * dependency it never reached: a client told to stop, or answering from a
   * queue, resolves with something that is not a pong. The reply is checked
   * rather than discarded.
   */
  async check(): Promise<HealthIndicatorResult> {
    const session = this.indicators.check('redis')
    try {
      const reply = await withinBudget(this.redis.ping(), PING_BUDGET_MS)
      return reply === 'PONG' ? session.up() : session.down('unavailable')
    } catch (error) {
      // The connection's own last failure is the second candidate - see
      // `reason`, and `RedisProbe.lastFailureCode`.
      return session.down(reason(error, { code: this.redis.lastFailureCode() }))
    }
  }

  /** The probe's connection is its own, so it is this class that closes it. */
  onApplicationShutdown(): void {
    this.redis.disconnect()
  }
}

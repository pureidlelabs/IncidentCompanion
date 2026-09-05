/**
 * Whether this server can reach Postgres and Redis, said in words a stranger
 * may read.
 */
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus'
import type { Pool } from 'pg'

import { PG_POOL } from '../db/db.module.js'
import { HEALTH_REDIS, type RedisProbe } from './health.redis.js'

/**
 * How long a dependency has to answer.
 */
export const PING_BUDGET_MS = 2000

/**
 * Everything a failed probe is allowed to say.
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

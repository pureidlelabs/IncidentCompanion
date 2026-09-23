/**
 * The readiness probe over the Redis connection that sessions and rate limits
 * are served from, and the last thing that went wrong on it.
 *
 * **That connection, not one of the probe's own**: a separate one can be up
 * while the serving one is still reconnecting, and health would say well
 * while every signed-in request fails.
 */
import { ConfigService } from '@nestjs/config'
import { Logger, type Provider } from '@nestjs/common'

import { AuthRedis } from '../auth/redis.js'
import type { Env } from '../config/env.js'

export const HEALTH_REDIS = Symbol('HEALTH_REDIS')

/**
 * What the probe needs from Redis, which is not a Redis.
 *
 * **`lastFailureCode` exists because the rejection does not carry one.**
 * Measured against a stopped server: `ping()` rejects with
 * `MaxRetriesPerRequestError`, whose message is about the retry option and
 * which has **no own properties at all** - no `code`, nothing naming the
 * network. The `ECONNREFUSED` is real but arrives separately, on the client's
 * `error` event. So a probe that reads only the rejection can say nothing more
 * useful than "unavailable", and the difference between a stopped Redis and a
 * wrong password is exactly what the person reading this endpoint wants.
 */
export interface RedisProbe {
  ping(): Promise<string>
  /** The code from the most recent connection error, if one is remembered. */
  lastFailureCode(): string | undefined
}

export const healthRedisProvider: Provider = {
  provide: HEALTH_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): RedisProbe => {
    const log = new Logger('HealthRedis')
    const client = AuthRedis.connect(config.get('REDIS_URL', { infer: true }))

    let lastCode: string | undefined
    // The failed dial's code arrives here and not on the rejected command.
    client.on('error', (error: Error & { code?: string }) => {
      lastCode = error.code
      log.warn(`redis: ${error.message}`)
    })
    // A connection that came up is a connection whose last failure is history;
    // keeping it would make one refused dial outlive every later recovery.
    client.on('ready', () => { lastCode = undefined })

    return {
      ping: () => client.ping(),
      lastFailureCode: () => lastCode,
    }
  },
}

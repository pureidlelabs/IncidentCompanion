/**
 * The readiness probe's own Redis connection, and the last thing that went
 * wrong on it.
 */
import { ConfigService } from '@nestjs/config'
import { Logger, type Provider } from '@nestjs/common'
import Redis from 'ioredis'

import type { Env } from '../config/env.js'

export const HEALTH_REDIS = Symbol('HEALTH_REDIS')

/**
 * What the probe needs from Redis, which is not a Redis.
 */
export interface RedisProbe {
  ping(): Promise<string>
  disconnect(): void
  /** The code from the most recent connection error, if one is remembered. */
  lastFailureCode(): string | undefined
}

export const healthRedisProvider: Provider = {
  provide: HEALTH_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): RedisProbe => {
    const log = new Logger('HealthRedis')
    const client = new Redis(config.get('REDIS_URL', { infer: true }), {
      /**
       * **Nothing is connected until the first probe.**
       */
      lazyConnect: true,
      /**
       * **One retry, because the budget in `dependencies.health.ts` is the
       * real limit.** ioredis defaults to 20 per request; a command outliving
       * the probe's budget is answered as a timeout anyway, so the retries
       * only decide how long the socket keeps trying after nobody is waiting.
       */
      maxRetriesPerRequest: 1,
    })

    let lastCode: string | undefined
    /**
     * **An `error` event with no listener is thrown, not logged.** ioredis
     * emits one per failed connection attempt, and an unhandled `error` on an
     * EventEmitter is an uncaught exception - so the probe that exists to
     * report an unreachable Redis would instead take the process down with it.
     */
    client.on('error', (error: Error & { code?: string }) => {
      lastCode = error.code
      log.warn(`redis: ${error.message}`)
    })
    // A connection that came up is a connection whose last failure is history;
    // keeping it would make one refused dial outlive every later recovery.
    client.on('ready', () => { lastCode = undefined })

    return {
      ping: () => client.ping(),
      disconnect: () => { client.disconnect() },
      lastFailureCode: () => lastCode,
    }
  },
}

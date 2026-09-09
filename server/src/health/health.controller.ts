/**
 * `GET /api/health` - whether this server can actually serve, not whether the
 * process is running. Answers 503 when a dependency is unreachable.
 *
 * `@Public()`, so nothing here may name what it failed to reach:
 * `dependencies.health.ts` maps every failure onto a closed set of reasons.
 */
import { Controller, Get, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HealthCheck, HealthCheckService, type HealthCheckResult } from '@nestjs/terminus'
import { Public } from '@thallesp/nestjs-better-auth'

import type { Env } from '../config/env.js'
import { AuditDeliveryHealth, PostgresHealth, RedisHealth } from './dependencies.health.js'

@Controller('api')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealth,
    private readonly redis: RedisHealth,
    private readonly delivery: AuditDeliveryHealth,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * **`@Public()` because the global guard authenticates everything by
   * default.** A probe has no session, so without this the route 401s and
   * every reader concludes the server is broken - the guard failing closed
   * exactly as intended, on the one route that must not.
   *
   * **Both dependencies are always checked, and the answer names both.**
   * Terminus runs them with `Promise.allSettled`, so a Postgres that is down
   * does not hide a Redis that is also down - which is the report worth having
   * when someone is looking at this at all. It answers 503 when either is
   * down, and the body says which.
   *
   * The audit's destination is reported only where one is configured.
   */
  @Public()
  @Get('health')
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    const checks = [() => this.postgres.check(), () => this.redis.check()]
    if (this.config.get('OTEL_EXPORTER_OTLP_LOGS_ENDPOINT', { infer: true })) {
      checks.push(() => this.delivery.check())
    }
    return this.health.check(checks)
  }
}

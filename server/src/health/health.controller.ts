/**
 * `GET /api/health` - whether this server can actually serve, not whether the
 * process is running. Answers 503 when a dependency is unreachable.
 */
import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, type HealthCheckResult } from '@nestjs/terminus'
import { Public } from '@thallesp/nestjs-better-auth'

import { PostgresHealth, RedisHealth } from './dependencies.health.js'

@Controller('api')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealth,
    private readonly redis: RedisHealth,
  ) {}

  /**
   * **`@Public()` because the global guard authenticates everything by
   * default.**
   */
  @Public()
  @Get('health')
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.postgres.check(), () => this.redis.check()])
  }
}

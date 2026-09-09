/**
 * The readiness probe and the two indicators behind it.
 *
 * **A module rather than three more entries in `AppModule`'s controller list**,
 * because the probe now has providers: `TerminusModule` supplies
 * `HealthIndicatorService`, and the probe holds a Redis connection of its own
 * whose shutdown hook has to be owned by something.
 *
 * `AboutController` and the install settings stay where they are - they have
 * no dependencies and answer from configuration alone.
 */
import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'

import { HealthController } from './health.controller.js'
import { ActivityController } from './activity.controller.js'
import { ResourcesController } from './resources.controller.js'
import { PostgresHealth, RedisHealth } from './dependencies.health.js'
import { healthRedisProvider } from './health.redis.js'

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, ResourcesController, ActivityController],
  providers: [PostgresHealth, RedisHealth, healthRedisProvider],
})
export class HealthModule {}

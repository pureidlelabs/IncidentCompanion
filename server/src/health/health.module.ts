/**
 * The readiness probe and the two indicators behind it.
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

/**
 * The app's own rate limit, behind nginx's.
 */
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis'
import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'

import { AuthRedis } from '../auth/redis.js'
import { AuditedThrottlerGuard } from './throttler.guard.js'
import { TIERS } from './tiers.js'

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const url = process.env['REDIS_URL']
        return {
          throttlers: TIERS,
          ...(url ? { storage: new ThrottlerStorageRedisService(AuthRedis.connect(url)) } : {}),
        }
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AuditedThrottlerGuard }],
})
export class ThrottleModule {}

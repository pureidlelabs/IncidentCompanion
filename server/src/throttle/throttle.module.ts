/**
 * The app's own rate limit, behind nginx's.
 *
 * **Two layers on purpose.** nginx stops the flood arriving from outside and
 * knows nothing about who is calling; this one is inside the session and can
 * count a caller, a route and a tier separately. Neither replaces the other -
 * the outer one survives the app being slow, and the inner one survives the
 * proxy being bypassed or reconfigured.
 *
 * **The count lives in Redis**, so it is one count across workers and survives
 * a restart. In memory it would be per process and cleared by every deploy,
 * which is the same weakness the lockout counter avoids by using columns.
 * `@nest-lab/throttler-storage-redis` is the throttler maintainers' own, so
 * nothing here implements a storage.
 *
 * **It fails open, deliberately, and that is only safe because of nginx.** A
 * limiter that refuses everything when Redis is unreachable is a denial of
 * service triggered by a cache outage. Layer one is still standing, so the
 * failure mode is "coarser than intended" rather than "no limit at all".
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

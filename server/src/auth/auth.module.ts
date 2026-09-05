/**
 * Better Auth, mounted into Nest.
 */
import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth'

import { createAuth, observesTheWindow } from './auth.config.js'
import { SetupController } from './setup.controller.js'
import { ChangePasswordController } from './change-password.controller.js'
import { MustChangePasswordInterceptor } from './must-change-password.interceptor.js'
import { PasswordHoldService } from './password-hold.service.js'
import { LockoutClearService } from './lockout-clear.service.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import type { Env } from '../config/env.js'
import { and, eq, gt } from 'drizzle-orm'

import { session } from '../db/schema/auth.js'
import { redisSessionStore } from './session-store.js'
import { AuthRedis } from './redis.js'

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      isGlobal: true,
      inject: [DATABASE, ConfigService],
      useFactory: (db: Database, config: ConfigService<Env, true>) => ({
        // **The guard reads a session on every route, and a read refreshes.**
        // Left alone, the idle window would be a function of the app's own
        // polling rather than of the analyst. -> `observesTheWindow`
        auth: observesTheWindow(createAuth(
          db,
          config.get('AUTH_SECRET', { infer: true }),
          config.get('AUTH_BASE_URL', { infer: true }),
          // Decides one thing: whether Vite's port is a trusted origin. It is
          // a different port, so it is a real grant and must not survive into
          // a production build. -> `trusted-origins.ts`
          config.get('NODE_ENV', { infer: true }),
          /**
           * **Built here rather than injected, because this factory runs before the
           * module's own providers exist.**
           */
          redisSessionStore(
            AuthRedis.connect(config.get('REDIS_URL', { infer: true })),
            undefined,
            undefined,
            /**
             * **What makes a revoke-all correct when Redis has lost the index.**
             */
            async (userId) =>
              (
                await db
                  .select({ token: session.token, expiresAt: session.expiresAt })
                  .from(session)
                  .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
              ).map((row) => ({ token: row.token, expiresAt: row.expiresAt.getTime() })),
          ),
        )),
      }),
    }),
  ],
  controllers: [ChangePasswordController, SetupController],
  providers: [
    // Owns the session cache's Redis connection and closes it on shutdown --
    // an open ioredis handle keeps the process alive, which in the test tier
    // reads as a suite that never finishes.
    AuthRedis,
    /**
     * **An interceptor, because a guard could not be ordered after the bridge's.**
     */
    { provide: APP_INTERCEPTOR, useClass: MustChangePasswordInterceptor },
    PasswordHoldService,
    LockoutClearService,
  ],
  // Exported so `accounts/` can hold an account, or clear its lockout,
  // without reaching `db/` itself.
  exports: [PasswordHoldService, LockoutClearService],
})
export class AuthModule {}

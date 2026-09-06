/**
 * Better Auth, mounted into Nest.
 *
 * **The global guard is left on.** The bridge installs an `AuthGuard` across
 * every route unless `disableGlobalAuthGuard` is set, so a new controller is
 * authenticated by default and has to say `@Public()` to opt out.
 *
 * **`forRootAsync`, because the instance needs the pool**: the auth tables are
 * in the Drizzle schema, so it cannot be constructed until the database
 * provider exists.
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
        auth: observesTheWindow(createAuth(
          db,
          config.get('AUTH_SECRET', { infer: true }),
          config.get('AUTH_BASE_URL', { infer: true }),
          // Decides one thing: whether Vite's port is a trusted origin. It is
          // a different port, so it is a real grant and must not survive into
          // a production build. -> `trusted-origins.ts`
          config.get('NODE_ENV', { infer: true }),
          /**
           * **Built here rather than injected, because this factory runs
           * before the module's own providers exist.** `AuthRedis` owns the
           * connection and closes it on shutdown; this asks it for the one
           * instance rather than opening a second.
           */
          redisSessionStore(
            AuthRedis.connect(config.get('REDIS_URL', { infer: true })),
            undefined,
            undefined,
            /**
             * **What makes a revoke-all correct when Redis has lost the
             * index.** Better Auth asks the secondary store which sessions a
             * user has and treats no answer as none; Postgres is the record,
             * so the store answers from here instead. -> `session-store.ts`
             *
             * `gt` rather than filtering in JS: an expired row is not a live
             * session, and handing one back would have the library delete a
             * Redis key that is already gone and report it as revoked.
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
     * **An interceptor, because a guard could not be ordered after the
     * bridge's.** The hold reads the session that the bridge's `AuthGuard`
     * attaches, and Nest gives no ordering between global guards from
     * different modules - measured, this ran first and held nobody.
     * Interceptors run after every guard. -> `must-change-password.interceptor.ts`
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

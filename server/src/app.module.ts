import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor } from 'nestjs-zod'

import { AccountsModule } from './accounts/accounts.module.js'
import { AuthModule } from './auth/auth.module.js'
import { CaseArchiveModule } from './case-archive/case-archive.module.js'
import { SpaModule } from './spa/spa.module.js'
import { CasesModule } from './cases/cases.module.js'
import { CollectionsModule } from './collections/collections.module.js'
import { IncidentImportModule } from './incident-import/incident-import.module.js'
import { ComplianceModule } from './compliance/compliance.module.js'
import { DbModule } from './db/db.module.js'
import { ThrottleModule } from './throttle/throttle.module.js'
import { InstallActivityModule } from './install-activity/install-activity.module.js'
import { InstallAuditModule } from './install-audit/install-audit.module.js'
import { ExportsModule } from './exports/exports.module.js'
import { PreferencesModule } from './preferences/preferences.module.js'
import { CustomersModule } from './customers/customers.module.js'
import { LibraryModule } from './library/library.module.js'
import { RecentModule } from './recent/recent.module.js'
import { DemoReportsModule } from './demo-reports/demo-reports.module.js'
import { ReportModule } from './report/report.module.js'
import { SpecsModule } from './specs/specs.module.js'
import { LiveModule } from './live/live.module.js'
import { loadEnv } from './config/env.js'
import { BrandController } from './brand/brand.controller.js'
import { AboutController } from './health/about.controller.js'
import { InstallSettingsController } from './health/install.controller.js'
import { HealthModule } from './health/health.module.js'
import { DocsController } from './docs.controller.js'
import { OpenApiController, OpenApiStore } from './openapi.controller.js'
import { ALL_ROUTES, CamelCaseBodyMiddleware } from './wire/camel-case.middleware.js'
import { ValidationPipe } from './wire/refusals.js'

/**
 * The root module: every feature module, the two global providers every route
 * inherits, and the body middleware `configure` applies.
 */
@Module({
  imports: [
    DemoReportsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      // Throws at startup rather than on the first request that needs a URL.
      validate: loadEnv,
    }),
    DbModule,
    // Directly after `DbModule` and before anything that writes: it is global
    // for the same reason, and every feature below owes it a line.
    InstallActivityModule,
    ThrottleModule,
    AuthModule,
    InstallAuditModule,
    HealthModule,
    CaseArchiveModule,
    AccountsModule,
    CasesModule,
    CollectionsModule,
    IncidentImportModule,
    ComplianceModule,
    ExportsModule,
    PreferencesModule,
    LiveModule,
    CustomersModule,
    LibraryModule,
    RecentModule,
    ReportModule,
    SpecsModule,
    /**
     * **Last, because it answers everything left.** `SpaController` sits at
     * `/` under a `{*path}` wildcard, so a module registered after it would be
     * unreachable.
     */
    SpaModule,
  ],
  controllers: [
    AboutController,
    InstallSettingsController,
    BrandController,
    OpenApiController,
    // Registered before `SpaModule`, or the SPA catch-all answers `/api/docs`
    // with the React shell - which has no such route, so a blank screen.
    DocsController,
  ],
  providers: [
    /**
     * **Global, so a route cannot forget it.** A per-handler pipe validates
     * the handlers someone remembered to annotate, and the one that matters is
     * the one they did not - an unvalidated body reaches the database with
     * whatever shape a client sent.
     */
    { provide: APP_PIPE, useClass: ValidationPipe },
    /**
     * Parses every `@ZodResponse` route's payload against the schema the
     * reference publishes; undecorated routes pass through untouched.
     *
     * **It strips as well as verifies** - the parse returns the schema's own
     * shape, so a field the schema does not name never leaves.
     */
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    /** Filled from `main.ts` once the application exists - see the class. */
    OpenApiStore,
  ],
})
export class AppModule implements NestModule {
  /**
   * **Every route, so a write cannot be reachable by curl and not by the app.**
   * The React client snake-cases every request body, so without this the
   * schemas - which are camelCase - reject the only body the browser sends.
   *
   * **`{*path}`, not `*`.** Express 5 parses routes with path-to-regexp v8,
   * where a bare `*` is not a wildcard - it matches nothing and throws no
   * error, so the middleware registers, the server starts, and every body
   * arrives unconverted. Measured: the write path answered the same 400 with
   * the middleware in place as without it.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CamelCaseBodyMiddleware).forRoutes(ALL_ROUTES)
  }
}

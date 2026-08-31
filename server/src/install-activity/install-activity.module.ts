/**
 * The audit writer, offered to any module that changes the installation.
 *
 * **`@Global`, for the same reason `DbModule` is.** Six unrelated features
 * write here - accounts, regimes, report languages - and none of them is
 * about auditing. Making each import a module to log a line is how a call site
 * gets skipped: the cheapest path has to be the one that records.
 */
import { Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'

import { AuditInterceptor } from './audit.interceptor.js'
import { InstallActivityService } from './install-activity.service.js'
import { InstallActivityPruneService } from './prune.service.js'

@Global()
@Module({
  providers: [
    InstallActivityService,
    InstallActivityPruneService,
    /**
     * **Global, because auditing is a property of the boundary.** Naming the
     * controllers would audit only where somebody already expected it to
     * matter - which is every route except the one that turns out to matter.
     */
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [InstallActivityService, InstallActivityPruneService],
})
export class InstallActivityModule {}

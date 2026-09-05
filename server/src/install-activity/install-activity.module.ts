/**
 * The audit writer, offered to any module that changes the installation.
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
     * **Global, because auditing is a property of the boundary.**
     */
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [InstallActivityService, InstallActivityPruneService],
})
export class InstallActivityModule {}

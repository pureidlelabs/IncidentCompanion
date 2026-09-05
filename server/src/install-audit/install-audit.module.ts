/**
 * Reading the audit log, which is a different layer from writing it.
 */
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { PreferencesModule } from '../preferences/preferences.module.js'

import { InstallActivityController } from './activity.controller.js'
import { InstallActivityPruneSchedule } from './prune.schedule.js'
import { InstallActivityReadService } from './read.service.js'
import { InstallPolicyController } from './policy.controller.js'
import { AuditRetentionController } from './retention.controller.js'

@Module({
  // **`forRoot` here rather than in `AppModule`.** The scheduler's timers are
  // this feature's only use of it, and registering it at the root would put a
  // live cron in every testing module that imports the root for something else.
  imports: [ScheduleModule.forRoot(), PreferencesModule],
  controllers: [InstallActivityController, AuditRetentionController, InstallPolicyController],
  providers: [InstallActivityReadService, InstallActivityPruneSchedule],
})
export class InstallAuditModule {}

/**
 * Reading the audit log, which is a different layer from writing it.
 *
 * **The split is a cycle the layering test refused, and the reason is real.**
 * `auth/` imports the *writer* - Better Auth's sign-in hooks record through
 * `recordInstallActivity`, so `install-activity` has to sit below `auth`. The
 * *reader* needs `@AdminOnly()`, which is `auth`'s, so it has to sit above.
 * One folder cannot be both, and the compiler said so before anybody argued.
 *
 * Not `@Global`: nothing else reads the audit, and a reader nothing imports is
 * a reader that cannot become a second write path by accident.
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

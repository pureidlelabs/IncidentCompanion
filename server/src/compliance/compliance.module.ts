/**
 * The case's regulatory record.
 */
import { Module } from '@nestjs/common'

import { LiveModule } from '../live/live.module.js'

import { PreferencesModule } from '../preferences/preferences.module.js'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { ComplianceController } from './compliance.controller.js'
import { ComplianceService } from './compliance.service.js'

@Module({
  // **`LiveModule`, because `CaseChannel` is injected `@Optional()`.**
  // Without it the service receives `undefined` and every write here stops
  // reaching the other analysts' screens - no error, and the unit tests stay
  // green because they pass a channel in by hand. -> `test/change-feed-wiring`
  imports: [PreferencesModule, LiveModule],
  controllers: [ComplianceController],
  // `CaseAccessGuard` is provided per module that mounts it, as every other
  // case-scoped module does: it injects the database handle, so a guard the
  // container cannot resolve is a boot failure rather than a missing check.
  providers: [ComplianceService, CaseAccessGuard],
  exports: [ComplianceService],
})
export class ComplianceModule {}

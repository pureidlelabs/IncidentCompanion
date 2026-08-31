/**
 * Filing the demos' reports: the one thing that needs the seeder and the
 * renderer at once.
 *
 * **A folder of its own, because both of the folders it composes refuse it.**
 * `report` may not reach `demos`, `demos` may not reach `report`, and
 * `ReportModule` already imports `CasesModule` - so it sits above both rather
 * than inside either. -> `architecture.test.ts`
 */
import { Module } from '@nestjs/common'

import { CasesModule } from '../cases/cases.module.js'
import { ReportModule } from '../report/report.module.js'

import { DemoReportSender } from './sender.service.js'

@Module({
  imports: [CasesModule, ReportModule],
  providers: [DemoReportSender],
})
export class DemoReportsModule {}

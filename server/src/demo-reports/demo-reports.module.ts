/**
 * Filing the demos' reports: the one thing that needs the seeder and the
 * renderer at once.
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

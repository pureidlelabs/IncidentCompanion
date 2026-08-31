import { Module } from '@nestjs/common'

import { LiveModule } from '../live/live.module.js'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { ActivityController } from './activity.controller.js'
import { AttributionController } from './attribution.controller.js'
import { CasesController } from './cases.controller.js'
import { CasesService } from './cases.service.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { LibraryService } from '../library/library.service.js'

@Module({
  // **`LiveModule`, because `CaseChannel` is injected `@Optional()`.**
  // Without it the service receives `undefined` and every write here stops
  // reaching the other analysts' screens - no error, and the unit tests stay
  // green because they pass a channel in by hand. -> `test/change-feed-wiring`
  imports: [LiveModule],
  controllers: [CasesController, AttributionController, ActivityController],
  providers: [CasesService, DemoSeederService, DemoContentSeeder, CaseAccessGuard, LibraryService],
  exports: [CasesService, DemoSeederService],
})
export class CasesModule {}

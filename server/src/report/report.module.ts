/**
 * The report's install-level vocabulary.
 */
import { Module } from '@nestjs/common'

import { LiveModule } from '../live/live.module.js'

import { ReportController } from './report.controller.js'
import { ReportExportController } from './export.controller.js'
import { ReportLifecycleService } from './lifecycle.service.js'
import { ReportRenderService } from './render.service.js'
import { LanguageService } from './language.service.js'
import { LanguageController } from './language.controller.js'
import { LibraryModule } from '../library/library.module.js'
import { CasesModule } from '../cases/cases.module.js'
import { ProseModule } from '../prose/prose.module.js'
import { EvidenceStore } from '../evidence/store.js'

@Module({
  // **`LiveModule`, because `CaseChannel` is injected `@Optional()`.**
  // Without it the service receives `undefined` and every write here stops
  // reaching the other analysts' screens - no error, and the unit tests stay
  // green because they pass a channel in by hand. -> `test/change-feed-wiring`
  imports: [LibraryModule, CasesModule, ProseModule, LiveModule],
  controllers: [ReportController, ReportExportController, LanguageController],
  // **`EvidenceStore` is provided here rather than imported.** It is stateless
  // - a root path off the config - so a second instance costs nothing, and
  // `CollectionsModule` does not export it. The archive module does the same.
  providers: [ReportLifecycleService, ReportRenderService, LanguageService, EvidenceStore],
  exports: [LanguageService, ReportLifecycleService],
})
export class ReportModule {}

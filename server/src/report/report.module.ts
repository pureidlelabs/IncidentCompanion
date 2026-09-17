/**
 * The report's install-level vocabulary.
 *
 * **Imports `LibraryModule` rather than the database**, because layouts and
 * styles are library rows - the same registry a case template comes from, and
 * the reason an analyst's own file appears without a code change.
 */
import { Module } from '@nestjs/common'

import { LiveModule } from '../live/live.module.js'

import { ReportController } from './report.controller.js'
import { ReportExportController } from './export.controller.js'
import { ReportLifecycleService } from './lifecycle.service.js'
import { ReportRenderService } from './render.service.js'
import { LanguagesModule } from '../languages/languages.module.js'
import { LanguageController } from './language.controller.js'
import { LibraryModule } from '../library/library.module.js'
import { CasesModule } from '../cases/cases.module.js'
import { ProseModule } from '../prose/prose.module.js'
import { PreferencesModule } from '../preferences/preferences.module.js'
import { EvidenceStore } from '../evidence/store.js'

@Module({
  // **`LiveModule`, because `CaseChannel` is injected `@Optional()`.**
  // Without it the service receives `undefined` and every write here stops
  // reaching the other analysts' screens - no error, and the unit tests stay
  // green because they pass a channel in by hand. -> `test/change-feed-wiring`
  // **`LanguagesModule`, because a pack is no longer this module's to provide.**
  // Re-exported below so anything that reached `LanguageService` through here
  // still does.
  imports: [LibraryModule, CasesModule, ProseModule, LiveModule, PreferencesModule, LanguagesModule],
  controllers: [ReportController, ReportExportController, LanguageController],
  // **`EvidenceStore` is provided here rather than imported.** It is stateless
  // - a root path off the config - so a second instance costs nothing, and
  // `CollectionsModule` does not export it. The archive module does the same.
  providers: [ReportLifecycleService, ReportRenderService, EvidenceStore],
  exports: [LanguagesModule, ReportLifecycleService],
})
export class ReportModule {}

/**
 * The `.iccase` a case travels in.
 *
 * **Separate from `archive/`, which is the container and reaches nothing.**
 * That folder is a pure transformation of bytes - a zip, a manifest and an
 * encryption envelope - and its purity is what lets the reader be tested
 * against hostile input with no database in the way. This one knows what a case
 * *is*, and everything it imports points downwards.
 */
import { Module } from '@nestjs/common'

import { ArchiveController } from './archive.controller.js'
import { ArchiveExportService } from './export.service.js'
import { ArchiveImportService } from './import.service.js'
import { CasesModule } from '../cases/cases.module.js'
import { EvidenceStore } from '../evidence/store.js'

@Module({
  imports: [CasesModule],
  controllers: [ArchiveController],
  providers: [ArchiveExportService, ArchiveImportService, EvidenceStore],
})
export class CaseArchiveModule {}

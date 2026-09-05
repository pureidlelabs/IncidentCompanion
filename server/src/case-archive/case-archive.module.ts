/**
 * The `.iccase` a case travels in.
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

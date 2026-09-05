/**
 * The import area: two doors, one service, one provider.
 */
import { Module } from '@nestjs/common'

import { CasesModule } from '../cases/cases.module.js'
import { CollectionsModule } from '../collections/collections.module.js'
import { CaseImportController, StartImportController } from './import.controller.js'
import { ImportService } from './import.service.js'

@Module({
  imports: [CollectionsModule, CasesModule],
  controllers: [CaseImportController, StartImportController],
  providers: [ImportService],
})
export class IncidentImportModule {}

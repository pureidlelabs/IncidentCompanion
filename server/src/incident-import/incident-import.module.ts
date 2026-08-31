/**
 * The import area: two doors, one service, one provider.
 *
 * **`CollectionsModule` for the write and `CasesModule` for the start door.**
 * Nothing here writes a row itself -- every insert goes through
 * `CollectionService`, which is where attribution, the reference check and the
 * change feed live.
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

/**
 * Getting data out of a case.
 *
 * **Its own module because it sits *above* collections, not inside one.** An
 * export reads several tables and will grow the indicator feed and the archive
 * beside the per-collection CSV; registering it from `CollectionsModule` made
 * the lower layer import the higher one, which `architecture.test.ts` refused
 * - correctly, since that is the direction that creates a cycle.
 */
import { Module } from '@nestjs/common'

import { ExportsController } from './exports.controller.js'
import { ImportService } from './import.service.js'
import { CaseAccessGuard } from '../access/case-access.guard.js'
import { CollectionsModule } from '../collections/collections.module.js'

@Module({
  imports: [CollectionsModule],
  controllers: [ExportsController],
  providers: [CaseAccessGuard, ImportService],
})
export class ExportsModule {}

/**
 * Getting data out of a case.
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

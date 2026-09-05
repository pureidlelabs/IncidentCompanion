import { Module } from '@nestjs/common'

import { EvidenceFileController } from './evidence-file.controller.js'
import { EvidenceStore } from '../evidence/store.js'

import { LiveModule } from '../live/live.module.js'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { CollectionService } from './collection.service.js'
import { BulkDeleteController } from './bulk-delete.controller.js'
import { ConflictsController } from './conflicts.controller.js'
import { ConflictsService } from './conflicts.service.js'
import { ENTITY_CONTROLLERS } from './entities.controller.js'
import { TimelineController } from './timeline.controller.js'

/**
 * Every entity collection: one service, and a controller apiece that adds no
 * logic.
 */
@Module({
  imports: [LiveModule],
  controllers: [
    TimelineController,
    BulkDeleteController,
    ConflictsController,
    // **Registered before the entity controllers.** `:id/file` is a
    // literal under a path the entity controller matches with a placeholder,
    // and Nest matches in registration order - after them, `file` arrives as
    // an entry id and the route 404s from inside the schema.
    EvidenceFileController,
    ...ENTITY_CONTROLLERS,
  ],
  providers: [CollectionService, ConflictsService, CaseAccessGuard, EvidenceStore],
  exports: [CollectionService, ConflictsService],
})
export class CollectionsModule {}

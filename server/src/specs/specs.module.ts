import { Module } from '@nestjs/common'

import { CollectionsController } from './collections.controller.js'
import { SpecsController } from './specs.controller.js'

/**
 * The forms, served from the schemas that validate them.
 */
@Module({ controllers: [SpecsController, CollectionsController] })
export class SpecsModule {}

import { Module } from '@nestjs/common'

import { CollectionsController } from './collections.controller.js'
import { SpecsController } from './specs.controller.js'

/**
 * The forms, served from the schemas that validate them. Holds no providers:
 * everything here is a constant, which is what lets `/api/specs` open no case
 * and be cached for a session.
 */
@Module({ controllers: [SpecsController, CollectionsController] })
export class SpecsModule {}

/**
 * The written prose.
 */
import { Module } from '@nestjs/common'

import { ProseService } from './prose.service.js'

/**
 * **No relay provided here.**
 */
@Module({
  providers: [ProseService],
  exports: [ProseService],
})
export class ProseModule {}

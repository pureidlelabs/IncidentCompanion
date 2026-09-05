/**
 * `ReachService`, everywhere.
 */
import { Global, Module } from '@nestjs/common'

import { GroupsController } from './groups.controller.js'
import { GroupsService } from './groups.service.js'
import { ReachService } from './reach.service.js'

@Global()
@Module({
  controllers: [GroupsController],
  providers: [ReachService, GroupsService],
  exports: [ReachService, GroupsService],
})
export class AccessModule {}

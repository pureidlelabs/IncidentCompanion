/**
 * `ReachService`, everywhere.
 *
 * **Global, because the things that need it are not one tier.** The guard in
 * front of every case route is provided by nine feature modules, and the live
 * gateway asks the same question by hand because no guard runs on an upgrade.
 * Listing the provider in each would put one line in ten files and leave the
 * eleventh failing at boot rather than working - the shape `db.module.ts` and
 * `install-activity.module.ts` are already global to avoid.
 */
import { Global, Module } from '@nestjs/common'

import { ReachService } from './reach.service.js'

@Global()
@Module({
  providers: [ReachService],
  exports: [ReachService],
})
export class AccessModule {}

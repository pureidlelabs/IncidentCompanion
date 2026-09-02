/**
 * `ReachService`, everywhere.
 *
 * **Global, because `CaseAccessGuard` is provided by nine feature modules and
 * now depends on this.** Listing it in each would put the same line in nine
 * files, and a tenth module mounting the guard would fail at boot with a
 * dependency error rather than working - which is the shape `db.module.ts` and
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

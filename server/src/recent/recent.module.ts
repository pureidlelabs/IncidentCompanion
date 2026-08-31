import { Module } from '@nestjs/common'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { RecentController } from './recent.controller.js'
import { RecentService } from './recent.service.js'

/**
 * Which cases an analyst has been in, and which they pinned. Keyed on the
 * analyst rather than on a case, so it opens nothing and scopes nothing.
 * -> `db/schema/case-visits.ts`
 */
@Module({ controllers: [RecentController], providers: [RecentService, CaseAccessGuard] })
export class RecentModule {}

/**
 * Whether the caller may touch this case at all. Today the rule is "the case
 * exists": any authenticated analyst may open any case, which is the current
 * product model and an open posture decision.
 *
 * A guard rather than a filter inside each service, so narrowing the rule to
 * membership is an edit here and not an audit of every collection. That every
 * case route mounts it is asserted by
 * `access/case-routes-guarded.test.ts`, not by this file.
 */
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { eq } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { cases } from '../db/schema/index.js'

/** What `ParseUUIDPipe` accepts, so the guard and the pipe refuse the same set. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

@Injectable()
export class CaseAccessGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ params: Record<string, string> }>()
    const caseId = request.params['caseId']
    // A guarded route naming no `caseId` is a wiring fault, so it is a 500
    // rather than a pass - letting it through makes a misspelled parameter a
    // silent no-op.
    if (!caseId) {
      throw new InternalServerErrorException(
        'This route is guarded as a case route and names no caseId.',
      )
    }

    /**
     * **Checked here because a guard runs before the pipes.** Every case route
     * declares `ParseUUIDPipe` on this parameter and every one of them still
     * answered 500 for `/api/cases/undefined/...`: this query ran first and
     * Postgres refused the cast. The pipe is still right; it is simply not the
     * first thing to see the value.
     */
    if (!UUID.test(caseId)) throw new BadRequestException(`${caseId} is not a case id.`)

    const [row] = await this.db.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId))
    // **404 rather than 403.** There is no membership rule to have failed, and
    // saying "that case exists but is not yours" would be a fact about someone
    // else's case - the answer to give once one does exist.
    if (!row) throw new NotFoundException(`No case ${caseId}.`)
    return true
  }
}

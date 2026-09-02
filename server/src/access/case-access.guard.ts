/**
 * Whether the caller may touch this case, and at what level.
 *
 * A guard rather than a filter inside each service, which is what let the rule
 * narrow from "the case exists" to membership in one edit rather than an audit
 * of every collection. That every case route mounts it is asserted by
 * `access/case-routes-guarded.test.ts`, not by this file.
 *
 * **The level an act needs is derived from the request**, never declared on
 * the route: a decorator is written by whoever adds the route, at the moment
 * they add it, which is the same person and moment as the route that forgot.
 * -> `levelNeeded`
 */
import {
  BadRequestException,
  CanActivate,
  ForbiddenException,
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
import { ReachService, type Level } from './reach.service.js'

/** What `ParseUUIDPipe` accepts, so the guard and the pipe refuse the same set. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Weakest to strongest, matching `reach.service.ts`. */
const RANK: readonly Level[] = ['read', 'write', 'delete']

const enough = (held: Level | null, needed: Level): boolean =>
  held !== null && RANK.indexOf(held) >= RANK.indexOf(needed)

/** The methods that only look. Anything else is treated as a write. */
const READING = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * The level this request needs, from its method and its path.
 *
 * **`delete` is the case as a whole and nothing smaller**, which the
 * specification says in one sentence and this tells apart by the path ending
 * at the case - not by listing the paths that go deeper, which would be a list
 * to keep true.
 *
 * A method nobody has added yet is a write rather than a read: guessing wrong
 * should cost an analyst a refusal, never cost a customer a write.
 */
export function levelNeeded(method: string, path: string): Level {
  if (READING.has(method.toUpperCase())) return 'read'
  if (method.toUpperCase() !== 'DELETE') return 'write'

  // **The query string is not a path segment.** Left on, `DELETE
  // /api/cases/abc?confirm=yes` reads as deleting something inside the case
  // and passes at the weaker level, which is the direction that matters.
  const segments = (path.split('?')[0] ?? '').replace(/\/+$/, '').split('/').filter(Boolean)
  const at = segments.indexOf('cases')
  // `.../cases/{id}` and nothing after it is the case itself.
  return at !== -1 && segments.length === at + 2 ? 'delete' : 'write'
}

@Injectable()
export class CaseAccessGuard implements CanActivate {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly reach: ReachService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params: Record<string, string>
      method: string
      originalUrl?: string
      url?: string
      user?: { id?: string }
      session?: { user?: { id?: string } }
    }>()
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

    const [row] = await this.db
      .select({ id: cases.id, customerId: cases.customerId })
      .from(cases)
      .where(eq(cases.id, caseId))
    if (!row) throw new NotFoundException(`No case ${caseId}.`)

    const userId = request.session?.user?.id ?? request.user?.id
    // A guarded route with no session is a wiring fault in the same way a
    // missing `caseId` is: the auth guard runs first, so reaching here without
    // one means this route was mounted outside it.
    if (!userId) {
      throw new InternalServerErrorException(
        'This route is guarded as a case route and carries no session.',
      )
    }

    /**
     * **A case attributed to nobody is the default customer's.** Cases predate
     * the customer directory and carry no `customerId`, and the default is
     * exactly the record for an incident whose origin is not yet known - so
     * treating them as anything else would strand them behind a grant nobody
     * can be given.
     */
    const defaultCustomerId = await this.reach.defaultCustomerId()
    const customerId = row.customerId ?? defaultCustomerId
    const held = customerId ? await this.reach.levelFor(userId, customerId) : null
    const needed = levelNeeded(request.method, request.originalUrl ?? request.url ?? '')


    /**
     * **404 where they reach nothing, 403 where they reach it too weakly.**
     * Saying "that case exists but is not yours" is a fact about somebody
     * else's case and is not owed to a caller who reaches none of it; a caller
     * who already reads it has been told it exists, so refusing their write
     * with a 404 would only be confusing.
     */
    if (held === null) throw new NotFoundException(`No case ${caseId}.`)
    if (!enough(held, needed)) {
      throw new ForbiddenException(
        needed === 'delete'
          ? 'Deleting a case needs read, write and delete on its customer.'
          : `This needs ${needed} on the case's customer, and you have ${held}.`,
      )
    }
    return true
  }
}

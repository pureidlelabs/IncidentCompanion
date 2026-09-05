/**
 * Whether the caller may touch this case, and at what level.
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
 */
export function levelNeeded(method: string, path: string): Level {
  if (READING.has(method.toUpperCase())) return 'read'
  if (method.toUpperCase() !== 'DELETE') return 'write'

  // **The query string is not a path segment.** Left on, `DELETE
  // /api/cases/abc?confirm=yes` reads as deleting something inside the case
  // and passes at the weaker level, which is the direction that matters.
  //
  // **Lower-cased for the same reason, and it is the same bug twice.** Express
  // does not enable `case sensitive routing`, so `/api/Cases/{id}` reaches the
  // case-delete handler while `indexOf('cases')` below finds nothing and
  // answers `write` -- which an analyst holds on the default customer. The
  // normalisation is safe here because nothing downstream reads a segment's
  // text: only the position of `cases` and how many follow it.
  const segments = (path.split('?')[0] ?? '')
    .toLowerCase()
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
  const at = segments.indexOf('cases')
  // `.../cases/{id}` and nothing after it is the case itself.
  return at !== -1 && segments.length === at + 2 ? 'delete' : 'write'
}

/**
 * **Two things this derivation rests on that Express does not promise.**
 */

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
      /**
       * Express's own parse of the target: no query, no fragment, no authority.
       */
      path?: string
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
     * **Checked here because a guard runs before the pipes.**
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
     * **A case attributed to nobody is the default customer's.**
     */
    const defaultCustomerId = await this.reach.defaultCustomerId()
    const customerId = row.customerId ?? defaultCustomerId
    const held = customerId ? await this.reach.levelFor(userId, customerId) : null
    /**
     * **`request.path`, because the raw target is the caller's string and this one
     * is Express's.**
     */
    if (request.path === undefined) {
      throw new InternalServerErrorException(
        'This route is guarded as a case route and carries no parsed path.',
      )
    }
    const needed = levelNeeded(request.method, request.path)

    /**
     * **404 where they reach nothing, 403 where they reach it too weakly.**
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

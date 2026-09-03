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
import { ADMIN_ROLE } from '../auth/auth.config.js'
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
 *
 * **Hand it the path Express derived, never the raw request target.** Every
 * defect this function has had is one parser disagreeing with another over the
 * same bytes, and the caller controls those bytes. -> `canActivate`
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
 *
 * `request.path` is `parseurl(req).pathname`, and the router trims `req.url`
 * as it descends into a mounted sub-router -- so a case route mounted under
 * `app.use('/x', ...)` would be asked about the remaining path rather than the
 * whole one. It is intact here because nothing mounts a sub-app, which makes
 * this a property of how the application is assembled rather than a guarantee.
 * `wire/camel-case.middleware.ts` records the same behaviour from the other
 * side, where a mounted middleware sees `req.path` as `/`.
 *
 * And a guarded route's path need not contain `cases` at all:
 * `recent-cases/:caseId` is guarded and answers `write` because
 * `'recent-cases'` is not the segment `'cases'`. That is the right answer for
 * the wrong reason -- rename the controller to `cases/recent` and removing an
 * entry from a personal list silently becomes a case deletion.
 *
 * **Both are the same weakness: a level decided from the shape of a string.**
 * Deriving it from the handler Nest is about to invoke cannot be fooled by
 * casing, a fragment, an absolute-form target or a mount prefix, because it is
 * not derived from the URL. -> #127, which carries the polarity argument and
 * two checks that look right and are not.
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
       *
       * **The raw target is deliberately not declared here.** `originalUrl` and
       * `url` were what this guard used to read, and leaving them in the shape
       * invites the next reader to reach for one.
       */
      path?: string
      user?: { id?: string; role?: string }
      session?: { user?: { id?: string; role?: string } }
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
    /**
     * **`request.path`, because the raw target is the caller's string and this
     * one is Express's.** Reading `originalUrl` meant re-parsing bytes the
     * router had already parsed, and every disagreement between the two
     * parsers was an escalation -- each measured, as an analyst holding only
     * the default customer's read and write, and each answering 200 with the
     * case gone:
     *
     * - `DELETE /api/cases/{id}#/x` -- the router strips the fragment and runs
     *   the handler; the raw target splits into four segments and reads as a
     *   write. nginx forwards a fragment byte-for-byte, so this is reachable
     *   through the shipped proxy.
     * - `DELETE http://cases/api/cases/{id}` -- absolute-form, which RFC 7230
     *   obliges a server to accept; `indexOf('cases')` finds the authority.
     * - `DELETE /api/Cases/{id}` -- Express routes case-insensitively.
     *
     * `path` carries none of the three. The lower-casing stays because the
     * casing is a property of the path itself rather than of the target.
     *
     * **Absent, it is a 500 rather than a fallback**, for the same reason the
     * two checks above are: falling back to the raw target would restore the
     * defect, and defaulting to a level would default to `write`, which is the
     * permissive direction and the one an attacker wants.
     */
    if (request.path === undefined) {
      throw new InternalServerErrorException(
        'This route is guarded as a case route and carries no parsed path.',
      )
    }
    const needed = levelNeeded(request.method, request.path)

    /**
     * **A hole in `management and data reach are separate grants`**, and the
     * only one. An administrator reaches `delete` on the default customer
     * without a group, so an install can delete a case nobody has attributed
     * before it has built its first group.
     *
     * **Its reach is the default customer, not the unattributed case.** The
     * line above collapses the two -- a case with no `customerId` and a case
     * naming the default arrive here identically -- so nothing downstream can
     * tell them apart, whatever the argument for the clause was about.
     *
     * `defaultCustomerId` is null on an install holding no default, and the
     * null check is what stops that reading as a match against a case that
     * names no customer either.
     */
    const role = request.session?.user?.role ?? request.user?.role
    if (
      needed === 'delete' &&
      defaultCustomerId !== null &&
      customerId === defaultCustomerId &&
      role === ADMIN_ROLE
    ) {
      return true
    }

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

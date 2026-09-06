/**
 * The throttler's guard, keyed on the caller rather than on the proxy - and
 * loud when it refuses.
 *
 * **Two things the stock guard does not do.**
 *
 * `getTracker` reads `x-real-ip`, because behind nginx `req.ip` is nginx on
 * every request: the stock tracker would count the whole install as one caller
 * and let the busiest analyst refuse everybody else. -> `caller.ts`
 *
 * `throwThrottlingException` writes a line, because a refusal nobody can see
 * is a control nobody can audit. A run against the sign-in route is exactly
 * the shape ISO 27002 8.15 wants in an application log, and until this it
 * ended at nginx's access log - a file no screen in this app reads.
 */
import { Inject, Injectable, Optional, type ExecutionContext } from '@nestjs/common'
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerRequest,
} from '@nestjs/throttler'
import type { Request } from 'express'

import { tierApplies } from './applies.js'
import { NO_ADDRESS, callerAddress } from './caller.js'
import { TIERS } from './tiers.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { recordInstallActivity } from '../install-activity/record.js'

@Injectable()
export class AuditedThrottlerGuard extends ThrottlerGuard {
  /**
   * **`@Optional`, because a guard is global and the harness boots slices.**
   * A module without the database provider would otherwise fail to build over
   * a rate limit it never reaches.
   */
  @Optional()
  @Inject(DATABASE)
  private readonly db?: Database

  protected override handleRequest(request: ThrottlerRequest): Promise<boolean> {
    const path = request.context.switchToHttp().getRequest<Request>().path
    // `true` is "this request is allowed", which for a tier that does not
    // apply is the whole of the answer.
    if (!tierApplies(request.throttler.name, path)) return Promise.resolve(true)
    return super.handleRequest(request)
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as Request
    const found = callerAddress(
      request.headers,
      request.socket?.remoteAddress,
      process.env['NODE_ENV'] ?? 'development',
    )
    return Promise.resolve(found ?? NO_ADDRESS)
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    if (this.db) {
      const request = context.switchToHttp().getRequest<Request>()
      /**
       * **The tier is in the line.** `auth` being hit is a credential run;
       * `burst` being hit is usually the importer. Without the name every
       * refusal reads the same and the log answers neither question.
       */
      await recordInstallActivity(this.db, {
        event: 'rate_limited',
        target: `${request.method} ${routeOf(request)}`,
        detail: {
          tier: tierNameFor(detail),
          limit: String(detail.limit),
        },
        headers: request.headers,
      })
    }
    await super.throwThrottlingException(context, detail)
  }
}

/**
 * Which tier refused, by its shape rather than by its name.
 *
 * **The detail carries no name.** `ThrottlerLimitDetail` has `ttl`,
 * `limit`, `key` and `tracker`; the name lives on `ThrottlerRequest`,
 * which this override is not handed. The ttl-and-limit pair is unique
 * across the tiers, so matching on it is exact rather than a guess - and
 * two tiers sharing a pair would be the same tier.
 */
function tierNameFor(detail: { ttl: number; limit: number }): string {
  const hit = TIERS.find((one) => one.limit === detail.limit && one.ttl === detail.ttl)
  return hit?.name ?? `limit-${String(detail.limit)}-per-${String(detail.ttl)}ms`
}

/**
 * The matched route, never the URL as typed.
 *
 * A path carrying an id makes every refusal a distinct string, so a run
 * against one route reads as a hundred unrelated lines - and the id is the
 * caller's text, which is how a log gets forged.
 */
function routeOf(request: Request): string {
  const route = (request.route as { path?: string } | undefined)?.path
  return route ?? 'unmatched'
}

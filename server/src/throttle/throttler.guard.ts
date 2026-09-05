/**
 * The throttler's guard, keyed on the caller rather than on the proxy - and
 * loud when it refuses.
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
   */
  @Optional()
  @Inject(DATABASE)
  private readonly db?: Database

  /**
   * **Every configured tier is evaluated on every request**, so the strict
   * sign-in tier has to be turned away from ordinary routes here - unscoped it
   * would hold the whole install to five requests per fifteen minutes, and the
   * install would stop working on the sixth click.
   */
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
       * **The tier is in the line.**
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
 */
function tierNameFor(detail: { ttl: number; limit: number }): string {
  const hit = TIERS.find((one) => one.limit === detail.limit && one.ttl === detail.ttl)
  return hit?.name ?? `limit-${String(detail.limit)}-per-${String(detail.ttl)}ms`
}

/**
 * The matched route, never the URL as typed.
 */
function routeOf(request: Request): string {
  const route = (request.route as { path?: string } | undefined)?.path
  return route ?? 'unmatched'
}

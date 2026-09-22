/**
 * The throttler's guard, keyed on the caller rather than on the proxy - and
 * loud when it refuses.
 *
 * **Two things the stock guard does not do.**
 *
 * `getTracker` reads `x-real-ip`, because behind nginx `req.ip` is nginx on
 * every request: the stock tracker would count the whole install as one caller
 * and let the busiest analyst refuse everybody else. -> `../wire/caller-address.ts`
 *
 * `throwThrottlingException` writes a line, because a refusal nobody can see
 * is a control nobody can audit. A run against the sign-in route is exactly
 * the shape ISO 27002 8.15 wants in an application log, and until this it
 * ended at nginx's access log - a file no screen in this app reads.
 */
import { Inject, Injectable, type ExecutionContext } from '@nestjs/common'
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler'
import type { Request } from 'express'

import { NO_ADDRESS, callerAddress } from '../wire/caller-address.js'
import { TIERS } from './tiers.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { recordInstallActivity } from '../install-activity/record.js'
import { routeOf } from '../install-activity/route-of.js'

@Injectable()
export class AuditedThrottlerGuard extends ThrottlerGuard {
  @Inject(DATABASE)
  private readonly db!: Database

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as Request
    const found = callerAddress(request.headers, request.socket?.remoteAddress)
    return Promise.resolve(found ?? NO_ADDRESS)
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>()
    // The tier is in the line: `burst` is usually the importer, `api` a script pacing itself.
    await recordInstallActivity(this.db, {
      event: 'rate_limited',
      target: `${request.method} ${routeOf(request)}`,
      detail: {
        tier: tierNameFor(detail),
        limit: String(detail.limit),
      },
      headers: request.headers,
    })
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


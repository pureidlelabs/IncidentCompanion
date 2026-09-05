/**
 * Records every request that changes the installation, and every refusal.
 */
import {
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import type { Request } from 'express'
import { catchError, tap, throwError, type Observable } from 'rxjs'

import { InstallActivityService } from './install-activity.service.js'
import { NAMED } from './named.js'

/** A request that changes something. */
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Reads worth a line, matched against the *matched route* rather than the URL.
 */
const SENSITIVE_READS: { pattern: RegExp; event: 'evidence_read' | 'data_exported' }[] = [
  { pattern: /\/evidence\/.*\/file$|\/evidence-file/, event: 'evidence_read' },
  { pattern: /\/exports?\//, event: 'data_exported' },
]

/**
 * Set on the request by a typed call, so this stays quiet for that act.
 */
export { NAMED }

export interface AuditedRequest extends Request {
  [NAMED]?: boolean
  session?: { user: { id: string; name?: string | null; email?: string | null } }
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly activity: InstallActivityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // **HTTP only, and the socket is a stated gap.** An upgrade inherits no
    // interceptor at all, so `live.gateway.ts` would have to record by hand.
    if (context.getType() !== 'http') return next.handle()

    const request = context.switchToHttp().getRequest<AuditedRequest>()
    const started = Date.now()
    const read = SENSITIVE_READS.find((one) => one.pattern.test(routeOf(request)))
    const interesting = WRITES.has(request.method) || read !== undefined

    return next.handle().pipe(
      tap(() => {
        // **After the handler, so a route that named itself has already said
        // so.** Running before would record every act twice: once vaguely
        // here and once properly there.
        if (!interesting || request[NAMED]) return
        void this.write(request, read?.event ?? 'api_called', 'success', started)
      }),
      catchError((why: unknown) => {
        const refused = why instanceof ForbiddenException || why instanceof UnauthorizedException
        if (refused) {
          void this.write(request, 'access_denied', 'failure', started, statusOf(why))
        } else if (interesting && !request[NAMED]) {
          // A failed write is a write that was attempted. `status_id: 2`.
          void this.write(request, read?.event ?? 'api_called', 'failure', started, statusOf(why))
        }
        return throwError(() => why)
      }),
    )
  }

  private async write(
    request: AuditedRequest,
    event: 'api_called' | 'access_denied' | 'evidence_read' | 'data_exported',
    outcome: 'success' | 'failure',
    started: number,
    status?: number,
  ): Promise<void> {
    const who = request.session?.user
    await this.activity.record({
      event,
      outcome,
      actor: { id: who?.id ?? null, label: who?.name ?? who?.email ?? null },
      target: `${request.method} ${routeOf(request)}`,
      detail: {
        ...(status === undefined ? {} : { status: String(status) }),
        ms: String(Date.now() - started),
      },
      headers: request.headers,
    })
  }
}

/**
 * The matched route, never the URL the caller typed.
 */
function routeOf(request: Request): string {
  const matched: unknown = (request as { route?: { path?: unknown } }).route?.path
  return typeof matched === 'string' ? matched : request.path.slice(0, 120)
}

function statusOf(why: unknown): number | undefined {
  return why instanceof HttpException ? why.getStatus() : undefined
}

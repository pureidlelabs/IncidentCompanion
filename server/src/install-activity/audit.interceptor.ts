/**
 * Records every request that changes the installation, and every refusal.
 *
 * **Auditing is a property of the boundary, not a chore for each route.** The
 * arrangement this replaces put one call at the end of each handler, guarded
 * by a test that read the source looking for routes that had forgotten - which
 * works until somebody adds the forty-eighth route, and is the shape of a gate
 * that exists because the design is wrong. Here a route cannot forget, because
 * recording was never its job.
 *
 * **What a route may still do is *name* what it did.** A typed method on
 * `InstallActivityService` records the semantics - a role change knows `from`
 * and `to`, a case delete knows the title that is about to stop existing - and
 * marks the request as already accounted for. This then stays quiet rather
 * than adding a second, vaguer line for the same act.
 *
 * ## What it records, and what it deliberately does not
 *
 * - **Every `POST`, `PUT`, `PATCH`, `DELETE`**, whatever the outcome. A write
 *   that failed is a write that was attempted, which is the half an audit is
 *   read for.
 * - **Every refusal**, `401` and `403` alike: a 403 is somebody reaching past
 *   their role, a 401 is an unauthenticated sweep, and recording only the
 *   first misses the shape most attacks arrive in.
 * - **Named sensitive reads only.** ISO 27002 8.15 wants resource access
 *   recorded, and evidence leaving the app is the highest-value read here -
 *   but a line per `GET` would be a line per pane load per row, which is the
 *   log becoming its own noise. The list is `SENSITIVE_READS` and it is short
 *   on purpose.
 * - **Never a request body.** It carries passwords, archive passphrases and
 *   case content; the route and the outcome are what an audit needs.
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
 *
 * **Short on purpose.** Every addition is a line per occurrence for ever, so
 * the test is whether somebody would ask "who read this" - which is true of
 * evidence and an export, and false of a list an analyst opens forty times a
 * shift.
 */
const SENSITIVE_READS: { pattern: RegExp; event: 'evidence_read' | 'data_exported' }[] = [
  { pattern: /\/evidence\/.*\/file$|\/evidence-file/, event: 'evidence_read' },
  { pattern: /\/exports?\//, event: 'data_exported' },
]

/**
 * Set on the request by a typed call, so this stays quiet for that act.
 *
 * **On the request rather than in the service**, because the question is *did
 * this request already account for itself* - which is per request, and a
 * service is a singleton shared by every request in flight.
 *
 * Declared in `named.ts` rather than here: the service needs it and injects
 * this class, and a cycle between them leaves one side undefined at runtime.
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
 *
 * **A path carries whatever the caller put in it**, so recording it verbatim
 * writes attacker-chosen text into the audit - the same objection that keeps
 * `x-forwarded-for` out of `ipAddress`. The Express route pattern is the app's
 * own string; `request.path` is the fallback for a request that matched no
 * route, and that is the one case where the value is theirs.
 */
function routeOf(request: Request): string {
  const matched: unknown = (request as { route?: { path?: unknown } }).route?.path
  return typeof matched === 'string' ? matched : request.path.slice(0, 120)
}

function statusOf(why: unknown): number | undefined {
  return why instanceof HttpException ? why.getStatus() : undefined
}

/**
 * An account that owes its own password reaches one route and no others.
 *
 * **Enforced on the server, not by the client routing away**, and registered
 * globally so a new controller is held by default. A held account is not a
 * read-only account, so a read is refused too. The library's routes never
 * reach Nest; `offersOnly` in `auth.config.ts` holds them.
 *
 * **An interceptor rather than a guard**, because this reads the session the
 * bridge's own `AuthGuard` attaches and Nest orders no two global guards.
 */
import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import type { Observable } from 'rxjs'
import type { Request } from 'express'

/** The refusal body, which the client routes on. */
export const HELD = {
  message: 'Set your own password before using the app.',
  mustChangePassword: true,
} as const

/**
 * The paths a held account may still reach, matched exactly: a prefix would
 * exempt any future route *named* like an allowed one.
 *
 * `/api/health` is unauthenticated anyway and is listed so a probe cannot be
 * made to look like an outage by an unrelated account's state.
 */
const ALLOWED_EXACTLY = ['/api/change-password', '/api/health']

@Injectable()
export class MustChangePasswordInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()

    const request = context.switchToHttp().getRequest<
      Request & { session?: { user?: { mustChangePassword?: boolean } } }
    >()

    // **No session is not this refusal.** The bridge's `AuthGuard` has already
    // decided whether the caller is signed in at all; answering 403 here would
    // turn every anonymous request into the wrong error.
    if (request.session?.user?.mustChangePassword !== true) return next.handle()

    // The query string is not part of the decision, and leaving it on turns
    // an allowed path into an unrecognised one the moment a client adds one.
    const path = (request.path || request.url || '').split('?')[0] ?? ''
    if (ALLOWED_EXACTLY.includes(path)) return next.handle()

    throw new ForbiddenException(HELD)
  }
}

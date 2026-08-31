/**
 * An account that owes its own password reaches one route and no others.
 *
 * **Enforced on the server, not by the client routing away**, and registered
 * globally so a new controller is held by default. What stays reachable is the
 * change itself, the session read behind it, and signing out: a held account is
 * not a read-only account, so a read is refused too.
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

/**
 * The paths a held account may still reach.
 *
 * **Matched exactly, and every one is needed to get out of the screen.**
 * Dropping `/api/auth` locks the analyst in: the change screen reads the
 * session to know who it is changing, and Sign out is the only other way off
 * it. `/api/health` is unauthenticated anyway and is listed so a probe cannot
 * be made to look like an outage by an unrelated account's state.
 */
const ALLOWED_EXACTLY = ['/api/change-password', '/api/health']

/**
 * **The one sub-tree that has to open whole**, because Better Auth owns many
 * routes under it and the change screen needs the session read and sign-out.
 * Everything else is matched exactly: a prefix list would exempt any future
 * route *named* like an allowed one - `/api/change-password-policy` would have
 * inherited the exemption without anybody deciding it should.
 */
const ALLOWED_UNDER = '/api/auth/'

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
    if (path === '/api/auth' || path.startsWith(ALLOWED_UNDER)) return next.handle()

    throw new ForbiddenException({
      message: 'Set your own password before using the app.',
      mustChangePassword: true,
    })
  }
}

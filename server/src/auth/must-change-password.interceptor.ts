/**
 * An account that owes its own password reaches one route and no others.
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
 */
const ALLOWED_EXACTLY = ['/api/change-password', '/api/health']

/**
 * **The one sub-tree that has to open whole**, because Better Auth owns many
 * routes under it and the change screen needs the session read and sign-out.
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

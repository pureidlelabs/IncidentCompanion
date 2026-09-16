/** `@Caller()` - the audit's caller, read off the request in one place. */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'

import type { Caller as CallerShape } from './install-activity.service.js'

export type Caller = CallerShape

/** The audit caller, read off the request of an HTTP execution context. */
export function callerOf(context: ExecutionContext): Caller {
  const request = context
    .switchToHttp()
    .getRequest<{ session: Caller['session']; headers: IncomingHttpHeaders }>()
  return { session: request.session, headers: request.headers, request }
}

export const Caller = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  callerOf(context),
)

/**
 * The matched route, never the URL the caller typed.
 *
 * **A path carries whatever the caller put in it**, so recording it verbatim
 * writes attacker-chosen text into the audit - the same objection that keeps
 * `x-forwarded-for` out of `ipAddress`. The Express route pattern is the app's
 * own string.
 *
 * **A request that matched no route falls back to a constant, never to the
 * path.** `target` is a partition column of the run window, so a caller who
 * can vary it keeps every one of their refusals a run of one and `Low` for
 * ever, which is the detection these events exist for. -> #541
 *
 * **Not a live vector, and the constant is defence in depth.** A request that
 * matches nothing reaches Nest's not-found handler, which runs no guard and no
 * interceptor, so nothing here records it -- and every GET matches the SPA's
 * catch-all anyway. The fallback was unreachable rather than open; it is a
 * constant so that a route added below the guard tier cannot quietly open it.
 *
 * Declared here rather than beside the interceptor for the reason `named.ts`
 * is: a guard records its own refusals and needs this, the interceptor module
 * provides the global interceptor, and a cycle between them leaves one side
 * undefined at runtime.
 */
import type { Request } from 'express'

export const UNMATCHED = 'unmatched'

export function routeOf(request: Request): string {
  const matched: unknown = (request as { route?: { path?: unknown } }).route?.path
  return typeof matched === 'string' ? matched : UNMATCHED
}

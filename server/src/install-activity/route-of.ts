/**
 * The matched route, never the URL the caller typed.
 *
 * **A path carries whatever the caller put in it**, so recording it verbatim
 * writes attacker-chosen text into the audit - the same objection that keeps
 * `x-forwarded-for` out of `ipAddress`. The Express route pattern is the app's
 * own string; `request.path` is the fallback for a request that matched no
 * route, and that is the one case where the value is theirs.
 *
 * Declared here rather than beside the interceptor for the reason `named.ts`
 * is: a guard records its own refusals and needs this, the interceptor module
 * provides the global interceptor, and a cycle between them leaves one side
 * undefined at runtime.
 */
import type { Request } from 'express'

export function routeOf(request: Request): string {
  const matched: unknown = (request as { route?: { path?: unknown } }).route?.path
  return typeof matched === 'string' ? matched : request.path.slice(0, 120)
}

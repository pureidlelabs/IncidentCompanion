/**
 * Which tier applies to which request.
 *
 * **The throttler evaluates every configured tier on every request**, so a
 * strict sign-in tier left unscoped applies to the whole app - five requests
 * per fifteen minutes, for everything. That is not a subtle regression: the
 * install stops working on the sixth click.
 *
 * **And the sign-in routes cannot be reached from here at all.** `/api/auth/*`
 * is mounted by the Better Auth adapter as middleware, which runs before every
 * guard, so no decorator and no path test in this file can govern them. That
 * is why the credential limit is Better Auth's rather than this layer's.
 */

/**
 * Whether a named tier should be applied to this request.
 *
 * **Every tier here applies everywhere, and there is no scoped one left.** The
 * strict credential tier this function used to narrow could never fire -- the
 * guard is not reached on `/api/auth/*` at all -- so it was removed rather than
 * rescoped. What limits those paths is Better Auth's own rule, in production.
 * The credential routes this app mounts itself are a separate question and an
 * open one. -> `tiers.ts`, #190, #549
 *
 * Kept as a function rather than inlined as `true`: the guard asks per tier,
 * and a scoped tier is a reasonable thing to add. `applies.test.ts` holds the
 * property that a new one has to satisfy.
 */
export function tierApplies(_tier: string | undefined, _path: string): boolean {
  return true
}

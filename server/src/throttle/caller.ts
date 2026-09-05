/**
 * Which address a rate limit counts against.
 *
 * **Behind nginx every request arrives from nginx.** `req.ip` is the proxy's
 * address on every call, so a limiter keyed on it counts the whole install as
 * one caller: the first busy analyst spends the budget and everybody else is
 * refused. A per-address limit built that way is not a weak control, it is a
 * denial-of-service aimed at the install by whoever is busiest.
 *
 * **`x-real-ip` and nothing else, and only in production**, which is the rule
 * `auth.config.ts` and `record.ts` already follow. `ic-proxy.inc` sets it with
 * `proxy_set_header X-Real-IP $remote_addr` - overwrite, not append - so a
 * caller's own value is discarded rather than extended, and that overwrite is
 * the only reason the header can be trusted at all.
 *
 * **`x-forwarded-for` is never read.** nginx overwrites that one too, but the
 * app must not depend on it: outside production there is no proxy, so a header
 * anybody can set would let a caller pick which bucket to spend - a limit with
 * a `next bucket please` button.
 */

/** `NODE_ENV`. Only the exact value `production` puts a proxy in front. */
export type Mode = string

/**
 * The address to count against, or `null` when there is none to trust.
 *
 * **`null` is a real answer and the caller must decide what it means.**
 * Falling back to "one shared bucket" silently reintroduces the whole-install
 * limit this exists to avoid, so the choice is made where it can be seen.
 */
export function callerAddress(
  headers: Record<string, string | string[] | undefined>,
  socket: string | undefined,
  mode: Mode,
): string | null {
  if (mode === 'production') {
    const real = headers['x-real-ip']
    const one = Array.isArray(real) ? real[0] : real
    return typeof one === 'string' && one.trim() !== '' ? one.trim() : null
  }
  // No proxy in the dev loop, so the socket is the caller.
  return typeof socket === 'string' && socket.trim() !== '' ? socket.trim() : null
}

/**
 * **A caller with no address is counted as one bucket per route, not as one
 * bucket for everybody.** Both wrong answers are worse: sharing a single
 * bucket lets one unidentifiable caller lock out every other unidentifiable
 * caller, and skipping the limit lets an attacker opt out of it by arriving
 * without the header.
 *
 * In production this only happens if nginx is bypassed - which means somebody
 * reached port 8080 directly, and the compose file publishes nothing.
 */
export const NO_ADDRESS = 'no-address'

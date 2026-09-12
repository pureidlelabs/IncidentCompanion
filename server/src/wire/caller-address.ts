/**
 * Whether the caller's claimed address may be believed, and what it is.
 *
 * **Behind nginx every request arrives from nginx.** `req.ip` is the proxy's
 * address on every call, so a limiter keyed on it counts the whole install as
 * one caller: the first busy analyst spends the budget and everybody else is
 * refused. A per-address limit built that way is not a weak control, it is a
 * denial-of-service aimed at the install by whoever is busiest.
 *
 * **`x-real-ip` and nothing else, and only in production.** `ic-proxy.inc`
 * sets it with `proxy_set_header X-Real-IP $remote_addr` - overwrite, not
 * append - so a caller's own value is discarded rather than extended, and that
 * overwrite is the only reason the header can be trusted at all. Outside
 * production there is no proxy to have done it, so the same header is whatever
 * the caller typed.
 *
 * **`x-forwarded-for` is never read, in any mode.** nginx overwrites that one
 * too, but depending on it would make the app's trust a property of a proxy
 * that may not be there - a limit with a `next bucket please` button, and an
 * audit a caller writes their own address into.
 *
 * **Here rather than beside any one reader, because three decisions read it
 * and they must not disagree.** The rate limiter's bucket, Better Auth's own
 * limiter and the audit's `ip_address` are one question asked three times;
 * `ip_address` is also a partition column of the audit's run window, so a
 * caller who can set it keeps every failure of theirs a run of one.
 */

/** The one spelling a caller cannot choose for themselves, where a proxy set it. */
export const TRUSTED_ADDRESS_HEADER = 'x-real-ip'

/**
 * The mode this decision reads, which is not the one `env.ts` resolves.
 *
 * **Unset means untrusted here, where `env.ts` defaults `NODE_ENV` to
 * `production`.** That default is the closed setting for the trusted-origin
 * list and the open one for this: `production` is what makes the header
 * believable, so a deployment that says nothing must not be taken to have a
 * proxy in front of it. The shipped image sets the variable; so does the dev
 * script. Unset is neither of them.
 */
export function addressMode(): string {
  return process.env['NODE_ENV'] ?? 'development'
}

/**
 * Which headers may name the caller, empty where none may.
 *
 * Better Auth takes the list rather than a value, so this is the shape that
 * reader needs; `[]` is not the same as unset, because the library reads
 * `ipAddressHeaders || DEFAULT_IP_HEADERS` and an empty array is truthy.
 */
export function trustedAddressHeaders(mode: string = addressMode()): string[] {
  return mode === 'production' ? [TRUSTED_ADDRESS_HEADER] : []
}

/**
 * The address to attribute a request to, or `null` when there is none to trust.
 *
 * `socket` is used only where no header may be believed, so a caller that has
 * no socket to offer - the audit, writing from a request it was handed rather
 * than one it is holding - passes `undefined` and gets `null` outside
 * production.
 *
 * **`null` is a real answer and the caller must decide what it means.**
 * Falling back to "one shared bucket" silently reintroduces the whole-install
 * limit this exists to avoid, so the choice is made where it can be seen.
 */
export function callerAddress(
  headers: Record<string, string | string[] | undefined>,
  socket: string | undefined,
  mode: string = addressMode(),
): string | null {
  const trusted = trustedAddressHeaders(mode)
  if (trusted.length > 0) {
    for (const name of trusted) {
      const value = headers[name]
      const one = Array.isArray(value) ? value[0] : value
      if (typeof one === 'string' && one.trim() !== '') return one.trim()
    }
    // **Never the socket here, and that is why this returns rather than falls
    // through.** Behind nginx the socket is nginx, so a request that arrived
    // without the header would be attributed to the proxy - the whole-install
    // bucket, on exactly the request that lost its header.
    return null
  }
  // No proxy outside production, so the socket is the only honest answer.
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

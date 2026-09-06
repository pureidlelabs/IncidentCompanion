/**
 * Which tier applies to which request.
 *
 * **The throttler evaluates every configured tier on every request**, so a
 * strict sign-in tier left unscoped applies to the whole app - five requests
 * per fifteen minutes, for everything. That is not a subtle regression: the
 * install stops working on the sixth click.
 *
 * **And the sign-in routes cannot be decorated.** `@Throttle` and
 * `@SkipThrottle` need a controller, and `/api/auth/*` is mounted by the
 * Better Auth adapter rather than by one of this app's controllers. So the
 * scoping is a path test in the guard, and it lives here where a unit test can
 * hold it rather than inside the guard where nothing can.
 */

const AUTH_PREFIX = '/api/auth'

/**
 * The paths the strict tier is for: the ones where a wrong answer is a guess.
 *
 * **Not all of `/api/auth`.** A session read (`/api/auth/get-session`) happens
 * on every page load, so putting it behind five-per-fifteen-minutes logs the
 * analyst out and calls it a rate limit.
 */
const GUESSABLE = ['/sign-in', '/sign-up', '/reset-password', '/forget-password', '/change-password']

export function isCredentialAttempt(path: string): boolean {
  if (!path.startsWith(AUTH_PREFIX)) return false
  const rest = path.slice(AUTH_PREFIX.length)
  return GUESSABLE.some((one) => rest === one || rest.startsWith(`${one}/`))
}

/**
 * Whether a named tier should be applied to this request.
 *
 * **The strict tier applies only to a credential attempt; the general ones
 * apply everywhere including there.** A run against sign-in should exhaust the
 * strict tier first, but it must still count against the burst ceiling - a
 * caller who found a path the strict tier does not name is exactly who the
 * general one is for.
 */
export function tierApplies(tier: string | undefined, path: string): boolean {
  if (tier === 'auth') return isCredentialAttempt(path)
  return true
}

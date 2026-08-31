/**
 * The rate-limit tiers, in a file of their own.
 *
 * **Neither the module nor the guard may own these**, because both need them:
 * the module to configure the throttler, the guard to name which tier refused.
 * A constant two collaborators share is a missing file rather than a reason to
 * import one from the other.
 */
import { minutes, seconds } from '@nestjs/throttler'

/**
 * **`auth` is deliberately tighter than nginx's, because it knows more.**
 * nginx allows 10 sign-in attempts a minute per address on a path; this allows
 * 5 in fifteen minutes and then blocks for the rest of the window, because
 * inside the app the request is known to *be* a sign-in attempt.
 *
 * **The block matters more than the limit.** Without `blockDuration` the count
 * drains as the window slides, so an attacker pacing themselves gets 5 guesses
 * every 15 minutes - 480 a day, indefinitely.
 *
 * **`api` sits above what an analyst produces and below what a script does**,
 * and `burst` exists because 300 a minute permits 300 in one second.
 */
export const TIERS = [
  {
    name: 'auth',
    ttl: minutes(15),
    limit: 5,
    blockDuration: minutes(15),
  },
  { name: 'api', ttl: minutes(1), limit: 300 },
  { name: 'burst', ttl: seconds(1), limit: 25 },
]

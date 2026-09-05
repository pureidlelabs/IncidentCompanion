/**
 * The rate-limit tiers, in a file of their own.
 */
import { minutes, seconds } from '@nestjs/throttler'

/**
 * **`auth` is deliberately tighter than nginx's, because it knows more.**
 * nginx allows 10 sign-in attempts a minute per address on a path; this allows
 * 5 in fifteen minutes and then blocks for the rest of the window, because
 * inside the app the request is known to *be* a sign-in attempt.
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

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
 * **No tier here covers a sign-in, because none can.** Better Auth is mounted
 * as middleware by `@thallesp/nestjs-better-auth`, and middleware runs before
 * guards, so this guard is never reached on `/api/auth/*`. One used to sit
 * here scoped to exactly that prefix, carrying the most confident prose in the
 * file about what it stopped, and it had never refused anything. -> #190
 *
 * What limits `/api/auth/*` is `CREDENTIAL_RULES` in `auth/auth.config.ts`,
 * five attempts per fifteen minutes on each guessable path -- **and only when
 * Better Auth's limiter is on, which it is in production and is not outside
 * it.** The shipped image sets `NODE_ENV=production`; a deployment that does
 * not has nginx's `ic_auth` zone and nothing else.
 *
 * **This is not the same as saying every credential route is covered.**
 * `POST /api/change-password` and `POST /api/setup` are mounted by this app's
 * own controllers, do reach this guard, and verify a secret -- and nothing
 * here is tighter than `api` for them. -> #549
 *
 * `applies.test.ts` holds the property that refuses another dead one: every
 * tier must apply to a path the guard actually sees.
 *
 * **`api` sits above what an analyst produces and below what a script does**,
 * and `burst` exists because 300 a minute permits 300 in one second.
 */
export const TIERS = [
  { name: 'api', ttl: minutes(1), limit: 300 },
  { name: 'burst', ttl: seconds(1), limit: 25 },
]

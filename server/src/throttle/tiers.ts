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
 * **No credential tier lives here, and that is not an omission.** A sign-in is
 * answered by Better Auth, which `@thallesp/nestjs-better-auth` mounts as
 * middleware -- and middleware runs before guards, so this guard is never
 * reached on `/api/auth/*` and a tier scoped to it could never fire. The
 * credential limit is `CREDENTIAL_RULES` in `auth/auth.config.ts`: five
 * attempts per fifteen minutes on each guessable path, in the secondary store.
 * nginx's `ic_auth` zone is the layer above that. -> #190
 *
 * One used to sit here, scoped to `/api/auth`, carrying the most confident
 * prose in the file about what it stopped. `applies.test.ts` holds the
 * property that refuses the next one: every tier must apply to a path the
 * guard actually sees.
 *
 * **`api` sits above what an analyst produces and below what a script does**,
 * and `burst` exists because 300 a minute permits 300 in one second.
 */
export const TIERS = [
  { name: 'api', ttl: minutes(1), limit: 300 },
  { name: 'burst', ttl: seconds(1), limit: 25 },
]

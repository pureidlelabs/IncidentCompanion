/**
 * How every query addressing the user row by its email address spells the
 * match.
 *
 * **Its own module rather than an export from `auth.config.ts`.** Both are
 * `auth/`, so either import is legal - but `auth.config.ts` is the Better Auth
 * wiring, and a service reaching into it for one `where` clause pulls that
 * whole graph in behind the predicate. A one-function module is also the one
 * identifier `user-row-is-addressed-case-folded.rule.test.ts` has to know.
 */
import { sql, type SQL } from 'drizzle-orm'

import { user } from '../db/schema/auth.js'

/**
 * The account an address belongs to, matched the way sign-in matches it.
 *
 * **Folded on the column, not on the input.** Better Auth stores a lower-cased
 * address on every path it owns, so lowering the argument alone would be
 * enough today - and it puts the assumption in every caller rather than in one
 * place, where a row written any other way becomes the row with no lockout and
 * no hold.
 */
export function sameAddress(attempted: string): SQL {
  return sql`lower(${user.email}) = lower(${attempted})`
}

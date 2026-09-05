/**
 * How every query addressing the user row by its email address spells the
 * match.
 */
import { sql, type SQL } from 'drizzle-orm'

import { user } from '../db/schema/auth.js'

/**
 * The account an address belongs to, matched the way sign-in matches it.
 */
export function sameAddress(attempted: string): SQL {
  return sql`lower(${user.email}) = lower(${attempted})`
}

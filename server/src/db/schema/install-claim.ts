/**
 * That this install has been claimed, and when.
 *
 * **Its own table rather than a row in `install_preferences`.** That table's
 * keys are a closed vocabulary and `preferences/install.service.ts` holds the
 * schema that refuses an unknown one; writing past that guard would make the
 * table's own description untrue. This is not a preference an administrator
 * sets either -- it is a fact about the install, written once by the act that
 * made it true.
 *
 * **One row, and the primary key is what makes it one.** The row is taken in
 * the same transaction that promotes the first administrator, so two claims
 * arriving together contend for it and exactly one wins.
 *
 * Not scoped to a case or an analyst, and under no row-level security.
 */
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * The one key this table ever holds.
 *
 * **A constant rather than a boolean column**, so the row's existence is the
 * fact and there is no second state where a row says the install is unclaimed.
 */
export const ONLY_CLAIM = 'install'

export const installClaim = pgTable('install_claim', {
  what: text('what').primaryKey(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
})

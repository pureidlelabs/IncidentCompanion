/**
 * Taking an unclaimed install, once.
 *
 * **The database decides who wins, not a check followed by a write.** Counting
 * the accounts and then creating one is two statements with a window between
 * them, and the caller controls the timing: two claims for different usernames
 * that both pass the count both sign up, and each promotes its own row. The
 * install's whole access model begins at that account, so the second one is a
 * privilege escalation rather than a tidiness problem.
 *
 * **A row only one caller can insert is the whole mechanism.** `key` is the
 * primary key of the install's own key-value store, so `on conflict do nothing`
 * returns a row to exactly one caller however many arrive together -- decided
 * inside one statement, by the database, with no lock held across the account
 * creation that follows.
 *
 * **Not a unique index on the administrator role**, which would also settle it
 * and would forbid a second administrator for ever. That is a decision about
 * what an install may look like rather than a fix for a race.
 */
import { and, eq, lt, sql } from 'drizzle-orm'

import type { Database, Transaction } from '../db/client.js'
import { installPreferences } from '../db/schema/preferences.js'

/** The install's own record that somebody has claimed it. */
export const CLAIMED_KEY = 'install.claimedAt'

/**
 * Take the install, or answer false because somebody else has it.
 *
 * The caller that gets `true` owns the claim and must either finish it or hand
 * it back with `releaseTheClaim`.
 */
export async function takeTheClaim(on: Database | Transaction): Promise<boolean> {
  const now = new Date()
  const taken = await on
    .insert(installPreferences)
    .values({ key: CLAIMED_KEY, value: { at: now.toISOString() } })
    .onConflictDoNothing()
    .returning({ key: installPreferences.key })
  if (taken.length > 0) return true

  /**
   * **A claim nobody finished is taken over, or an install can be stranded
   * unclaimable by a process that died.** `releaseTheClaim` covers the refusal
   * the account creation can answer with; it cannot cover the machine losing
   * power between taking this and creating anything.
   *
   * **Still one statement, so it is still the database deciding.** The `where`
   * carries the age, so of several callers finding the same stale row exactly
   * one update matches it and the rest match nothing.
   *
   * The window only has to outlast a claim in flight, which is one account
   * creation. An operator who waits it out and retries is the intended user of
   * this branch; a second caller racing the first is not, and cannot reach it.
   */
  const stale = new Date(now.getTime() - STALE_AFTER_MS).toISOString()
  const inherited = await on
    .update(installPreferences)
    .set({ value: { at: now.toISOString() } })
    .where(
      and(
        eq(installPreferences.key, CLAIMED_KEY),
        lt(sql`${installPreferences.value}->>'at'`, stale),
      ),
    )
    .returning({ key: installPreferences.key })
  return inherited.length > 0
}

/**
 * How long a claim may sit unfinished before another may take it over.
 *
 * Long enough to outlast creating one account, short enough that an operator
 * whose first attempt died is not locked out for a working day.
 */
const STALE_AFTER_MS = 60_000

/**
 * Hand the install back, because the claim it was taken for did not finish.
 *
 * **An install that can never be claimed again is worse than the race this
 * replaces.** Creating the account can refuse -- a password the install's own
 * policy will not accept is the ordinary way -- and the operator's next attempt
 * has to be able to succeed.
 */
export async function releaseTheClaim(on: Database | Transaction): Promise<void> {
  await on.delete(installPreferences).where(eq(installPreferences.key, CLAIMED_KEY))
}

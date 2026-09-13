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
 * **Taken in the transaction that promotes, not around the whole claim.** The
 * account is created by the authentication library on its own connection, so
 * nothing here can hold a transaction across it -- and a claim held across it
 * would need a timeout to survive a process that died, which is a window of
 * its own: a claim still in flight when the timeout passed would be taken over,
 * and both callers would promote. Holding it only across the promote removes
 * the window rather than shortening it, and a failure rolls the row back rather
 * than needing it handed back.
 *
 * **So a losing caller has created an account.** It is refused and the account
 * is taken back, which leaves exactly one administrator either way -- the
 * property the requirement asks for.
 *
 * **Not a unique index on the administrator role**, which would also settle it
 * and would forbid a second administrator for ever. That is a decision about
 * what an install may look like rather than a fix for a race.
 */
import type { Transaction } from '../db/client.js'
import { installClaim, ONLY_CLAIM } from '../db/schema/install-claim.js'

/**
 * Take the install, or answer false because somebody else just did.
 *
 * **Call inside the transaction that acts on winning.** The row is held for
 * that transaction, so a caller that wins and then fails rolls it back and the
 * install stays claimable with nothing to clean up.
 */
export async function takeTheClaim(tx: Transaction): Promise<boolean> {
  const taken = await tx
    .insert(installClaim)
    .values({ what: ONLY_CLAIM })
    .onConflictDoNothing()
    .returning({ what: installClaim.what })
  return taken.length > 0
}

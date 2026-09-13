/**
 * Composing several writes into one act, and telling anybody once it lands.
 *
 * **A write that opens its own transaction has committed by the time it
 * returns; one composed into a larger act has not.** `withCase` returning is a
 * released savepoint, so a subscriber told there would be sent to re-read a
 * case that a rollback may be about to remove -- and the remedy of announcing
 * nothing when composed makes the opposite failure, an act that lands and
 * tells nobody.
 *
 * So the act owns the announcement. A composed write registers what it would
 * have said, and `asOneAct` says it after the commit that made it true.
 *
 * **Nothing here reaches the channel.** What is registered is a closure the
 * caller built, so this module stays underneath every layer that announces.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import type { Database, Transaction } from './client.js'

/**
 * What the act in progress has been asked to say once it commits.
 *
 * **Async-local rather than keyed on the handle.** Drizzle hands each nested
 * `transaction()` its own object, so a write three layers down holds a
 * different handle from the one the act opened and could not find the act by
 * it.
 */
const acts = new AsyncLocalStorage<(() => void)[]>()

/**
 * Run `work` in one transaction, and deliver its announcements once it commits.
 *
 * A throw anywhere inside rolls the whole act back, and nothing is announced.
 *
 * **This is what makes composition legal.** A caller that opens a transaction
 * with `db.transaction` directly and passes the handle to a write gets a
 * refusal from `whenCommitted` rather than a silent failure to announce.
 */
export async function asOneAct<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const pending: (() => void)[] = []
  const answer = await acts.run(pending, () => db.transaction(work))
  for (const tell of pending) tell()
  return answer
}

/**
 * Say this once the act in progress commits.
 *
 * Throws where there is no act, which is a write composed into a transaction
 * that `asOneAct` did not open: its announcement has nowhere to wait, and
 * saying it now would be the premature announcement this module exists to
 * prevent. Callers that opened their own transaction announce directly and
 * never reach here.
 */
export function whenCommitted(tell: () => void): void {
  const pending = acts.getStore()
  if (!pending) {
    throw new Error(
      'A write was composed into a transaction that asOneAct did not open, so its ' +
        'announcement has nowhere to wait. Open the act with asOneAct(db, tx => ...).',
    )
  }
  pending.push(tell)
}

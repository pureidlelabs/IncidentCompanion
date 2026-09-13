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

/** What an act has been asked to say, and whether it has said it yet. */
interface Pending {
  readonly say: (() => void)[]
  said: boolean
}

/**
 * The act in progress.
 *
 * **Async-local rather than keyed on the handle.** Drizzle hands each nested
 * `transaction()` its own object, so a write three layers down holds a
 * different handle from the one the act opened and could not find the act by
 * it.
 *
 * The cost of that choice, stated because it is a real one: this finds the act
 * a caller is *inside*, not the transaction their write is *on*. A caller that
 * opened a second, independent transaction inside an act and passed that handle
 * to a write would register on the act, so an inner rollback under an outer
 * commit would announce rows that are not there. `asOneAct` refusing to nest is
 * what keeps the one reachable way of doing that shut.
 */
const acts = new AsyncLocalStorage<Pending>()

/** Raised where a write is composed into a transaction no act declared. */
export class ComposedWithoutAnAct extends Error {
  constructor(why: string) {
    super(why)
    this.name = 'ComposedWithoutAnAct'
  }
}

/**
 * Run `work` in one transaction, and deliver its announcements once it commits.
 *
 * A throw anywhere inside rolls the whole act back, and nothing is announced.
 *
 * Throws `ComposedWithoutAnAct` where an act is already in progress: `db` is a
 * pool, so this would open a *second* top-level transaction rather than a
 * savepoint -- two acts committing separately under one name, and a self
 * deadlock wherever the pool holds one connection.
 */
export async function asOneAct<T>(db: Database, work: (tx: Transaction) => Promise<T>): Promise<T> {
  if (acts.getStore()) {
    throw new ComposedWithoutAnAct(
      'An act is already in progress. asOneAct opens a transaction on the pool, so nesting ' +
        'one opens a second act rather than a savepoint. Pass the handle down instead.',
    )
  }
  const pending: Pending = { say: [], said: false }
  const answer = await acts.run(pending, () => db.transaction(work))
  pending.said = true
  for (const say of pending.say) say()
  return answer
}

/**
 * Say this once the act in progress commits.
 *
 * Throws `ComposedWithoutAnAct` where there is no act, which is a write
 * composed into a transaction `asOneAct` did not open: its announcement has
 * nowhere to wait, and saying it now would be the premature announcement this
 * module exists to prevent. Callers that opened their own transaction announce
 * directly and never reach here.
 *
 * **And where the act has already said everything.** Work started inside an act
 * and not awaited before it resolved can still reach this, and pushing onto a
 * list nothing will read again loses the announcement in silence -- which is
 * the failure this module is about, in the one shape nothing else could find.
 */
export function whenCommitted(say: () => void): void {
  const pending = acts.getStore()
  if (!pending) {
    throw new ComposedWithoutAnAct(
      'A write was composed into a transaction that asOneAct did not open, so its ' +
        'announcement has nowhere to wait. Open the act with asOneAct(db, tx => ...).',
    )
  }
  if (pending.said) {
    throw new ComposedWithoutAnAct(
      'The act this write was composed into has already committed and announced. Work ' +
        'started inside an act has to be awaited before that act returns.',
    )
  }
  pending.say.push(say)
}

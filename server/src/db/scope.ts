/**
 * The only way to reach a case's rows: opens a transaction, sets
 * `app.case_id` on it, and hands the callback the scoped handle.
 *
 * Row-level security refuses everything by default, so a read outside this
 * sees an empty table rather than the whole one. -> `db/schema/scoped.ts`
 *
 * **Everything inside must run on the handle passed in.** A query issued
 * against the pool from inside the callback takes a *different* connection,
 * which carries no scope and therefore sees nothing - quietly, as missing
 * data. From inside an open transaction it is worse than wrong: it holds one
 * connection while asking for another, and a pool with none left never answers.
 */
import { sql } from 'drizzle-orm'

import type { Database, Transaction } from './client.js'

/**
 * Either a pool or a transaction already open on it.
 *
 * A caller composing two writes into one act passes its own handle and gets a
 * savepoint: Drizzle opens a nested `transaction()` as one, so a throw anywhere
 * inside rolls the whole act back.
 */
export type Executor = Database | Transaction

/** A pool carries its client; a transaction is a handle on one already taken. */
function nested(db: Executor): db is Transaction {
  return !('$client' in db)
}

/** The scope in force, across the two shapes a driver answers `execute` with. */
function scopeIn(answer: unknown): string | null {
  const rows = (answer as { rows?: { held: string | null }[] }).rows ?? (answer as { held: string | null }[])
  return Array.isArray(rows) ? (rows[0]?.held ?? null) : null
}

export function withCase<T>(
  db: Executor,
  caseId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    /**
     * **Restored on the way out, because `set_config(..., true)` outlives the
     * savepoint that set it.** `rollback to savepoint` undoes it and `release`
     * does not, so a nested scope for a second case would still be in force
     * when the outer act resumed -- and row-level security reports a row it
     * cannot see as a row that is not there.
     *
     * Only when nested: at the top level the transaction ends either way, and
     * every write would otherwise pay two round trips to restore nothing.
     */
    const held = nested(db)
      ? scopeIn(await tx.execute(sql`select current_setting('app.case_id', true) as held`))
      : null

    await tx.execute(sql`select set_config('app.case_id', ${caseId}, true)`)
    const answer = await work(tx)

    // Only where `work` returned. A throw rolls the savepoint back, which
    // restores the setting itself -- and an aborted transaction refuses the
    // statement that would have done it, masking the error that caused it.
    if (held !== null && held !== caseId) {
      await tx.execute(sql`select set_config('app.case_id', ${held}, true)`)
    }
    return answer
  })
}

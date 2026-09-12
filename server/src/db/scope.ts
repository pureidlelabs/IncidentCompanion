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
 * data.
 */
import { sql } from 'drizzle-orm'

import type { Database, Transaction } from './client.js'

/**
 * Either a pool or a transaction already open on it.
 *
 * **A caller composing two writes into one act passes its own handle**, and
 * gets a savepoint rather than a second transaction: Drizzle opens a nested
 * `transaction()` as one, so a throw anywhere inside rolls the whole act back.
 * `set_config(..., true)` is transaction-local, so the scope is set again on the
 * savepoint rather than inherited by accident.
 */
export type Executor = Database | Transaction

export function withCase<T>(
  db: Executor,
  caseId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.case_id', ${caseId}, true)`)
    return work(tx)
  })
}

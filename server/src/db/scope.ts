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

export function withCase<T>(
  db: Database,
  caseId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.case_id', ${caseId}, true)`)
    return work(tx)
  })
}

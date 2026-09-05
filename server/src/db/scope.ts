/**
 * The only way to reach a case's rows: opens a transaction, sets
 * `app.case_id` on it, and hands the callback the scoped handle.
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

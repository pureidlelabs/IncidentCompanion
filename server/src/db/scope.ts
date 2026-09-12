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

/**
 * The scope in force, as the empty string where there is none.
 *
 * **Unset and empty are the same answer and must not be told apart here.** A
 * connection that has never carried a scope reads `NULL`; once any transaction
 * on it has set one, it reads `''` for ever after. Branching on that would make
 * the restore below depend on which pooled connection a request happened to
 * get. `scoped.ts` maps both to no case: `nullif(..., '')::uuid`.
 */
function scopeIn(answer: unknown): string {
  const rows = (answer as { rows?: { held: string | null }[] }).rows
  return rows?.[0]?.held ?? ''
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
      : caseId

    await tx.execute(sql`select set_config('app.case_id', ${caseId}, true)`)
    const answer = await work(tx)

    /**
     * **Only where `work` returned**: a throw rolls the savepoint back, which
     * puts the setting back without being asked.
     *
     * The restore can itself fail, where a callback swallowed a query error and
     * returned anyway -- the transaction is aborted and refuses this too, so
     * `withCase` throws where that callback meant to return. No callback in the
     * tree does that, and the alternative is to swallow a failed restore, which
     * leaves the scope wrong and says nothing.
     */
    if (held !== caseId) {
      await tx.execute(sql`select set_config('app.case_id', ${held}, true)`)
    }
    return answer
  })
}

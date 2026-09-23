/**
 * The only way to reach a case's rows: opens a transaction, sets
 * `app.case_id` and `app.principal` on it, and hands the callback the scoped
 * handle.
 *
 * Row-level security refuses everything by default, so a read outside this
 * sees an empty table rather than the whole one, and a read naming a case its
 * principal does not reach sees the same. -> `db/schema/scoped.ts`
 *
 * **Everything inside must run on the handle passed in.** A query issued
 * against the pool from inside the callback takes a *different* connection,
 * which carries no scope and therefore sees nothing - quietly, as missing
 * data. From inside an open transaction it is worse than wrong: it holds one
 * connection while asking for another, and a pool with none left never answers.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import { NotFoundException } from '@nestjs/common'
import { sql } from 'drizzle-orm'

import type { Database, Transaction } from './client.js'
import { isOutOfReach } from './missing-parent.js'

/**
 * Either a pool or a transaction already open on it.
 *
 * A caller composing two writes into one act passes its own handle and gets a
 * savepoint: Drizzle opens a nested `transaction()` as one, so a throw anywhere
 * inside rolls the whole act back.
 */
export type Executor = Database | Transaction

/**
 * Whether this handle is a transaction already open, rather than a pool.
 *
 * A pool carries its client; a transaction is a handle on one already taken.
 *
 * **Exported because "is this composed?" is asked outside this module too**, and
 * the other way to ask it -- comparing against the caller's own handle -- is
 * wrong for the second pool this install has: a write handed `SEED_DATABASE`
 * opens and commits its own transaction and is not composed, while an identity
 * check says it is.
 */
export function nested(db: Executor): db is Transaction {
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

/** Who is asking, read when a scope opens: an account id, or null for nobody. */
const acting = new AsyncLocalStorage<() => string | null | undefined>()

/**
 * Run `work` as the account `who` names, which every scope opened inside it
 * carries as its principal.
 *
 * A function is read as each scope opens, so a request can be named before
 * authentication has said whose it is.
 */
export function actingAs<T>(who: string | (() => string | null | undefined), work: () => T): T {
  return acting.run(typeof who === 'function' ? who : () => who, work)
}

/**
 * Run `work` naming nobody. Only a role the policies exempt reaches a case
 * this way, which is the seeding role and nothing that serves a request.
 */
export function unattended<T>(work: () => T): T {
  return acting.run(() => null, work)
}

/** Who the calling context says is asking: an id, null for nobody, undefined where it says nothing. */
export function principalNow(): string | null | undefined {
  return acting.getStore()?.()
}

/** @throws where nothing in the calling context says who is asking */
function principal(): string {
  const who = principalNow()
  if (who === undefined) {
    throw new Error(
      'Case data was asked for with nobody named as asking. Run the work under ' +
        '`actingAs`, which a request and a socket frame already do.',
    )
  }
  return who ?? ''
}

/**
 * A transaction carrying the principal and no case: for `cases` and
 * `case_visits`, whose policies ask who is asking and not which case is open.
 *
 * @throws where nothing in the calling context says who is asking
 */
export async function withReach<T>(
  db: Executor,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const who = principal()
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.principal', ${who}, true)`)
    return work(tx)
  })
}

/**
 * @throws where nothing in the calling context says who is asking
 * @throws NotFoundException where the store refuses a write for reach, which
 *   is how a case that is not there is answered too
 */
export async function withCase<T>(
  db: Executor,
  caseId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const who = principal()
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

    await tx.execute(
      sql`select set_config('app.case_id', ${caseId}, true), set_config('app.principal', ${who}, true)`,
    )
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
  }).catch((error: unknown) => {
    if (isOutOfReach(error)) throw new NotFoundException(`No case ${caseId}.`, { cause: error })
    throw error
  })
}

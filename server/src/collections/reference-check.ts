/**
 * That every reference a row carries points inside its own case.
 *
 * **Postgres cannot answer this one, and it is not obvious why.** A foreign key
 * is checked internally, outside row-level security - so `INSERT INTO timeline
 * (case_id -> A, system_id -> a row in B)` satisfies the key, never meets a
 * policy, and lands.
 *
 * A composite key on `(case_id, id)` would enforce it structurally and need no
 * code at all - except that `ON DELETE SET NULL` on a composite key nulls
 * **every** column in it, `case_id` included, so deleting a system would tear
 * the timeline entry out of its own case. Postgres 15 can restrict that to
 * named columns; Drizzle cannot express it. So the check lives here.
 *
 * **The lookup runs inside the scoped transaction, and that is the whole
 * trick.** Row-level security already hides other cases' rows, so asking "does
 * this id exist?" from inside case A *is* asking "is it in case A?". There is
 * no case comparison in this file and there should never be one - adding one
 * would be a second statement of a rule the database is already keeping.
 *
 * **Here rather than in `domain/`**, which may not reach the database at all.
 * The domain says which fields are references; this says whether they resolve.
 */
import { inArray } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { z } from 'zod'

import { columnOf } from '../db/column-access.js'
import type { Transaction } from '../db/client.js'
import { idsIn, referenceFieldsOf } from '../domain/references.js'
import { REFERENCE_TABLES } from './registry.js'

const TARGETS: Record<string, PgTable> = REFERENCE_TABLES

export interface DanglingReference {
  readonly field: string
  readonly target: string
  readonly ids: string[]
}

/**
 * Check every reference in `values` against the case this transaction is
 * scoped to, and report the ones that do not resolve.
 *
 * **Returns the failures rather than throwing**, because the create and patch
 * paths report a refusal differently and both need this answer.
 */
export async function danglingReferences(
  tx: Transaction,
  schema: z.ZodObject,
  values: Record<string, unknown>,
): Promise<DanglingReference[]> {
  const found: DanglingReference[] = []

  for (const { field, target } of referenceFieldsOf(schema)) {
    if (!(field in values)) continue

    // **Loud, because the silent version is indistinguishable from a clean
    // check.** A target with no table is a reference nothing can resolve, and
    // skipping it removes the only check standing between an id list and
    // another case's rows.
    const table = TARGETS[target]
    if (!table) throw new Error(`No table for reference target "${target}" (field ${field}).`)

    const ids = idsIn(values[field])
    if (ids.length === 0) continue

    const id = columnOf(table, 'id')
    const rows = (await tx
      .select({ id })
      .from(table)
      .where(inArray(id, ids))) as { id: string }[]

    const reachable = new Set(rows.map((row) => row.id))
    const missing = ids.filter((id) => !reachable.has(id))
    if (missing.length > 0) found.push({ field, target, ids: missing })
  }

  return found
}

/**
 * What the caller is told.
 *
 * **Names the field and never says where the row actually is.** Distinguishing
 * "no such row anywhere" from "a row in a case you cannot see" would answer the
 * question this check exists to refuse.
 */
export function refusalFor(dangling: DanglingReference[]): string {
  const named = dangling.map((one) => one.field).join(', ')
  return `No such ${dangling.length === 1 ? 'row' : 'rows'} in this case: ${named}.`
}

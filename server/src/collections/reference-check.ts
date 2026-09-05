/**
 * That every reference a row carries points inside its own case.
 */
import { inArray } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { z } from 'zod'

import { columnOf } from '../db/column-access.js'
import type { Transaction } from '../db/client.js'
import { idsIn, referenceFieldsOf } from '../domain/references.js'
import { REFERENCE_TABLES } from './registry.js'

/**
 * `refTarget` to the table it names - **the registry's own map, never a copy
 * written here**, and `registry.test.ts` asserts every `refTarget` names an
 * entry in it. -> `collections/registry.ts`
 */
const TARGETS: Record<string, PgTable> = REFERENCE_TABLES

/** One field that pointed somewhere it may not. */
export interface DanglingReference {
  readonly field: string
  readonly target: string
  readonly ids: string[]
}

/**
 * Check every reference in `values` against the case this transaction is
 * scoped to, and report the ones that do not resolve.
 */
export async function danglingReferences(
  tx: Transaction,
  schema: z.ZodObject,
  values: Record<string, unknown>,
): Promise<DanglingReference[]> {
  const found: DanglingReference[] = []

  for (const { field, target } of referenceFieldsOf(schema)) {
    if (!(field in values)) continue

    // **Loud, because the silent version is what shipped.** A target with no
    // table is a reference nothing can resolve, and skipping it removes the
    // only check standing between an id list and another case's rows.
    const table = TARGETS[target]
    if (!table) throw new Error(`No table for reference target "${target}" (field ${field}).`)

    const ids = idsIn(values[field])
    if (ids.length === 0) continue

    const id = columnOf(table, 'id')
    // Inside the scope, so a row in another case simply is not there.
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

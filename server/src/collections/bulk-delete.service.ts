/**
 * Which rows still point at the ones about to be deleted.
 *
 * **Postgres will not answer this for us, and that is deliberate.** The
 * foreign keys are `ON DELETE SET NULL`, because deleting a host must not
 * delete the malware found on it - the sample is still evidence and only loses
 * its link. That is right for a single delete and wrong as a *silent* answer
 * to a bulk one: forty references blanked at once is data an analyst never
 * agreed to lose.
 *
 * So the count is taken first, and a non-empty answer refuses the whole
 * selection.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { columnOf } from '../db/column-access.js'
import type { Database } from '../db/client.js'
import { withCase } from '../db/scope.js'
import { REVIEWABLE } from './registry.js'
import { REFERENCE_HOLDERS } from '../domain/collections.js'
import type { BulkTarget } from '../domain/collections.js'

/**
 * How many surviving rows name each id in the selection.
 *
 * **A row inside the selection does not count as a reference.** Deleting a
 * host and the malware on it together is the ordinary case; counting the
 * malware would refuse a selection that is about to remove the reference
 * itself.
 */
export async function referenceCounts(
  db: Database,
  caseId: string,
  targets: { collection: BulkTarget; id: string }[],
): Promise<Record<string, number>> {
  const doomed = new Set(targets.map((t) => `${t.collection}:${t.id}`))
  const byTarget = new Map<BulkTarget, string[]>()
  for (const { collection, id } of targets) {
    byTarget.set(collection, [...(byTarget.get(collection) ?? []), id])
  }

  const counts: Record<string, number> = {}
  const bump = (id: string, by: number) => {
    if (by > 0) counts[id] = (counts[id] ?? 0) + by
  }

  // Scoped once, around every read below. Row-level security answers each
  // of them with nothing outside this case, so a reference count cannot be
  // inflated by another customer's rows. -> `db/scope.ts`
  await withCase(db, caseId, async (tx) => {
    for (const { collection, field, target, many } of REFERENCE_HOLDERS) {
      const ids = byTarget.get(target)
      if (!ids?.length) continue
      const holder = REVIEWABLE[collection]
      // A collection the registry names and this install has no table for is a
      // wiring fault, not a row with no references: answering zero would be the
      // silent miss this whole derivation exists to end.
      if (!holder) throw new Error(`no table for ${collection}, which declares a reference`)
      const rowId = columnOf(holder, 'id')
      const held = columnOf(holder, field)
      const inCase = eq(columnOf(holder, 'caseId'), caseId)

      if (!many) {
        const rows = (await tx
          .select({ ref: held, id: rowId })
          .from(holder)
          .where(and(inCase, inArray(held, ids)))) as { ref: string; id: string }[]
        for (const row of rows) {
          if (doomed.has(`${collection}:${row.id}`)) continue
          bump(row.ref, 1)
        }
        continue
      }

      for (const id of ids) {
        // `jsonb_exists`, not the `?` operator: `?` is node-postgres's own
        // placeholder character and the driver rewrites it out of the query.
        const rows = (await tx
          .select({ id: rowId })
          .from(holder)
          .where(and(inCase, sql`jsonb_exists(${held}, ${id})`))) as { id: string }[]
        bump(id, rows.filter((row) => !doomed.has(`${collection}:${row.id}`)).length)
      }
    }
  })

  return counts
}

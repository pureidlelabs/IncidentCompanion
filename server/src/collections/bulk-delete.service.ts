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
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'

import { columnOf } from '../db/column-access.js'
import type { Database } from '../db/client.js'
import { withCase } from '../db/scope.js'
import { REFERENCE_HOLDERS, REVIEWABLE } from './registry.js'
import { reports } from '../db/schema/report.js'
import type { BulkTarget, Collection } from '../domain/collections.js'

/**
 * Rows whose reference an analyst could still release, per holder collection.
 *
 * **A reference nobody can remove is not one worth refusing over.** A block in
 * a sent report cannot be deleted or edited -- the store turns both away --
 * so counting it leaves the analyst with a delete that is
 * refused, a holder they cannot reach, and no way out. The reference is inert
 * besides: a sent report is painted from its frozen tree and its figure is
 * fetched by hash from the evidence store, so the row being refused over is
 * not what the export reads. -> `report/render.service.ts`
 *
 * A block in a *draft* report is the opposite on every count, and is still
 * counted -- which is why the collection is scoped rather than dropped.
 *
 * Only the report tier has rows that close, so this is one entry rather than a
 * table. -> `db/schema/store-guards.ts`
 */
function releasable(collection: Collection): SQL | undefined {
  if (collection !== 'report_blocks') return undefined
  return sql`not exists (
    select 1 from ${reports}
    where ${reports.id} = ${columnOf(REVIEWABLE['report_blocks']!, 'reportId')}
      and ${reports.sentAt} is not null
  )`
}

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
      const inCase = and(eq(columnOf(holder, 'caseId'), caseId), releasable(collection))

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

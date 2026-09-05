/**
 * Which rows still point at the ones about to be deleted.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { columnOf } from '../db/column-access.js'
import type { Database } from '../db/client.js'
import { withCase } from '../db/scope.js'
import { TABLES, type BulkTarget } from './registry.js'

/**
 * Every column that can name a row of a given collection.
 */
const SCALAR_REFS: { table: keyof typeof TABLES; column: string; target: BulkTarget }[] = [
  { table: 'malware', column: 'systemId', target: 'systems' },
  { table: 'malware', column: 'accountId', target: 'accounts' },
  { table: 'network_indicators', column: 'systemId', target: 'systems' },
  { table: 'network_indicators', column: 'malwareId', target: 'malware' },
  { table: 'impact', column: 'systemId', target: 'systems' },
  { table: 'impact', column: 'accountId', target: 'accounts' },
  { table: 'cloud_apps', column: 'accountId', target: 'accounts' },
  { table: 'evidence', column: 'systemId', target: 'systems' },
  { table: 'evidence', column: 'accountId', target: 'accounts' },
  { table: 'timeline', column: 'systemId', target: 'systems' },
  { table: 'timeline', column: 'sourceSystemId', target: 'systems' },
]

/**
 * The many-sided references, which are jsonb arrays of ids.
 */
const ARRAY_REFS: { table: keyof typeof TABLES; column: string; target: BulkTarget }[] = [
  { table: 'timeline', column: 'accountIds', target: 'accounts' },
  { table: 'timeline', column: 'malwareIds', target: 'malware' },
  { table: 'timeline', column: 'networkIndicatorIds', target: 'network_indicators' },
  { table: 'timeline', column: 'cloudAppIds', target: 'cloud_apps' },
  { table: 'timeline', column: 'evidenceIds', target: 'evidence' },
  { table: 'impact', column: 'evidenceIds', target: 'evidence' },
]

/**
 * How many surviving rows name each id in the selection.
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
    for (const { table, column, target } of SCALAR_REFS) {
      const ids = byTarget.get(target)
      if (!ids?.length) continue
      const holder = TABLES[table]
      const ref = columnOf(holder, column)
      const rowId = columnOf(holder, 'id')
      const rows = (await tx
        .select({ ref, id: rowId })
        .from(holder)
        .where(and(eq(columnOf(holder, 'caseId'), caseId), inArray(ref, ids)))) as {
        ref: string
        id: string
      }[]
      for (const row of rows) {
        if (doomed.has(`${table}:${row.id}`)) continue
        bump(row.ref, 1)
      }
    }

    for (const { table, column, target } of ARRAY_REFS) {
      const ids = byTarget.get(target)
      if (!ids?.length) continue
      const holder = TABLES[table]
      const rowId = columnOf(holder, 'id')
      const held = columnOf(holder, column)
      for (const id of ids) {
        // `jsonb_exists`, not the `?` operator: `?` is node-postgres's own
        // placeholder character and the driver rewrites it out of the query.
        const rows = (await tx
          .select({ id: rowId })
          .from(holder)
          .where(
            and(
              eq(columnOf(holder, 'caseId'), caseId),
              sql`jsonb_exists(${held}, ${id})`,
            ),
          )) as { id: string }[]
        bump(id, rows.filter((row) => !doomed.has(`${table}:${row.id}`)).length)
      }
    }

  })

  return counts
}

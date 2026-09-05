/**
 * The one way a case-owned row is written: a write routed around it lands
 * unowned, unversioned, and invisible to every other analyst's open screen.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import type { Database } from './client.js'
import { changeFeed } from './schema/change-feed.js'
import { columnOf, columnsOf } from './column-access.js'
import { withCase } from './scope.js'

/** What a refused write tells the caller, so it can raise a merge review. */
export interface Refused {
  readonly ok: false
  /** The version now in the database - what the other analyst wrote over. */
  readonly currentVersion: number | null
}

export interface Applied<T> {
  readonly ok: true
  readonly row: T
}

export type WriteResult<T> = Applied<T> | Refused

/**
 * Update one row, but only if nobody has written it since it was read.
 */
export async function updateVersioned<T extends { version: number }>(
  db: Database,
  options: {
    table: PgTable
    entity: string
    caseId: string
    id: string
    expectedVersion: number
    actorId: string
    patch: Record<string, unknown>
    /**
     * The column `id` names, when it is not `id` - for a table whose key *is*
     * the case, like `case_compliance`, which has no `id` column at all.
     */
    keyColumn?: string
  },
): Promise<WriteResult<T>> {
  const { table, entity, caseId, id, expectedVersion, actorId, patch } = options
  const keyColumn = options.keyColumn ?? 'id'
  const fields = Object.keys(patch)

  // Scoped, so the update and its feed row are both inside the case that
  // row-level security will match them against. -> `db/scope.ts`
  return withCase(db, caseId, async (tx) => {
    // `columnsOf` for the presence check below, which asks whether this table
    // is keyed on the case at all; `columnOf` where the column must exist.
    const columns = columnsOf(table)
    const version = columnOf(table, 'version')

    /**
     * Which row, and whose case - both, never the id alone, which is a write
     * across customers.
     */
    const scope =
      columns['caseId'] && keyColumn !== 'caseId'
        ? [eq(columnOf(table, keyColumn), id), eq(columnOf(table, 'caseId'), caseId)]
        : [eq(columnOf(table, keyColumn), id)]
    const updated = (await tx
      .update(table)
      .set({
        ...patch,
        updatedBy: actorId,
        updatedAt: new Date(),
        // **Belt-and-braces, and measured as redundant while the `where`
        // below stands.** The matched row's version *is* `expectedVersion`, so
        // `expectedVersion + 1` computes the same number - swapping to it
        // leaves the whole suite green, which is how this comment came to be
        // corrected rather than trusted. It says what it means in SQL and
        // survives someone loosening the `where`, so it stays; it is not the
        // mechanism, and the `where` is.
        version: sql`${version} + 1`,
      })
      .where(and(...scope, eq(version, expectedVersion)))
      .returning()) as T[]

    if (updated.length === 0) {
      // Scoped too, or a refusal leaks the version of a row in another case.
      const [current] = (await tx
        .select({ version })
        .from(table)
        .where(and(...scope))) as {
        version: number
      }[]
      return { ok: false, currentVersion: current?.version ?? null }
    }

    const row = updated[0]!
    await tx.insert(changeFeed).values({
      caseId,
      entity,
      entityId: id,
      op: 'update',
      version: row.version,
      actorId,
      fields,
    })
    return { ok: true, row }
  })
}

/** Which artefacts each case names, and releasing what one case stopped naming. */
import { Logger } from '@nestjs/common'
import { and, eq, isNotNull, sql } from 'drizzle-orm'

import type { Database } from '../db/client.js'
import { inSeries } from '../db/in-series.js'
import { withCase } from '../db/scope.js'
import { evidence } from '../db/schema/entities.js'
import { reports } from '../db/schema/report.js'
import { EvidenceStore, isDigest } from '../evidence/store.js'
import { figureHashes } from './document/model.js'

export interface Named {
  /** Digests an evidence row says this case holds. */
  stored: Set<string>
  /** Those, and every figure a sent report of this case froze. */
  kept: Set<string>
}

/** What one case's rows name, asked with the case named in every question. */
export async function namedIn(db: Database, caseId: string): Promise<Named> {
  const [rows, sent] = await withCase(db, caseId, (tx) =>
    inSeries(
      () =>
        tx
          .select({ hash: evidence.hash })
          .from(evidence)
          .where(and(eq(evidence.caseId, caseId), isNotNull(evidence.storedAt))),
      () =>
        tx
          .select({ frozen: reports.frozen })
          .from(reports)
          .where(and(eq(reports.caseId, caseId), isNotNull(reports.frozen))),
    ),
  )
  // Narrows the column's type: a stored row always has a digest.
  const stored = new Set(rows.flatMap((row) => (row.hash ? [row.hash] : [])))
  const kept = new Set([...stored, ...sent.flatMap((row) => figureHashes(row.frozen))])
  return { stored, kept }
}

/** Every case whose rows name an artefact, with what they name. Asked for nobody. */
export async function artefactsNamed(db: Database): Promise<Map<string, Named>> {
  const { rows } = await db.execute<{ case_id: string; hash: string; stored: boolean }>(
    sql`select case_id, hash, stored from ic_artefacts_named()`,
  )
  const named = new Map<string, Named>()
  for (const row of rows) {
    const one = named.get(row.case_id) ?? { stored: new Set<string>(), kept: new Set<string>() }
    if (row.stored) one.stored.add(row.hash)
    one.kept.add(row.hash)
    named.set(row.case_id, one)
  }
  return named
}

/**
 * Remove from the case whichever of `hashes` nothing in it names any more.
 * Call inside `store.exclusive(caseId, ...)`, after the write that stopped
 * naming them has committed.
 *
 * Logs rather than throws: the write already stands, and what is left the
 * census counts.
 */
export async function release(
  db: Database,
  store: EvidenceStore,
  caseId: string,
  hashes: Iterable<string | null | undefined>,
): Promise<void> {
  const candidates = [...hashes].filter((hash): hash is string => !!hash && isDigest(hash))
  if (candidates.length === 0) return
  try {
    const { kept } = await namedIn(db, caseId)
    await store.forget(
      caseId,
      candidates.filter((hash) => !kept.has(hash)),
    )
  } catch (why) {
    new Logger('Evidence').warn(
      `artefacts case ${caseId} stopped naming left in the store: ${String(why)}`,
    )
  }
}

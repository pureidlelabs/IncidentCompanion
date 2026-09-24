/** Which artefacts each case names, and releasing what one case stopped naming. */
import { Logger } from '@nestjs/common'
import { and, eq, isNotNull } from 'drizzle-orm'

import type { Database } from '../db/client.js'
import { inSeries } from '../db/in-series.js'
import { withCase } from '../db/scope.js'
import { cases } from '../db/schema/case.js'
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

/** Every case the install holds, each with what its rows name, asked one case at a time. */
export async function artefactsNamed(db: Database): Promise<Map<string, Named>> {
  const named = new Map<string, Named>()
  for (const { id } of await db.select({ id: cases.id }).from(cases))
    named.set(id, await namedIn(db, id))
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

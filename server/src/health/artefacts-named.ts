/** Which artefacts each case's rows name. */
import { and, eq, isNotNull } from 'drizzle-orm'

import type { Database } from '../db/client.js'
import { inSeries } from '../db/in-series.js'
import { withCase } from '../db/scope.js'
import { cases } from '../db/schema/case.js'
import { evidence } from '../db/schema/entities.js'
import { reports } from '../db/schema/report.js'
import { figureHashes } from '../report/document/model.js'

export interface Named {
  /** Digests an evidence row says this case holds. */
  stored: Set<string>
  /** Those, and every figure a sent report of this case froze. */
  kept: Set<string>
}

/** Every case the install holds, each with what its rows name, asked one case at a time. */
export async function artefactsNamed(db: Database): Promise<Map<string, Named>> {
  const open = await db.select({ id: cases.id }).from(cases)
  const named = new Map<string, Named>()
  for (const one of open) {
    const [rows, sent] = await withCase(db, one.id, (tx) =>
      inSeries(
        () =>
          tx
            .select({ hash: evidence.hash })
            .from(evidence)
            .where(and(eq(evidence.caseId, one.id), isNotNull(evidence.storedAt))),
        () =>
          tx
            .select({ frozen: reports.frozen })
            .from(reports)
            .where(and(eq(reports.caseId, one.id), isNotNull(reports.frozen))),
      ),
    )
    // Narrows the column's type: a stored row always has a digest.
    const stored = new Set(rows.flatMap((row) => (row.hash ? [row.hash] : [])))
    const kept = new Set([...stored, ...sent.flatMap((row) => figureHashes(row.frozen))])
    named.set(one.id, { stored, kept })
  }
  return named
}

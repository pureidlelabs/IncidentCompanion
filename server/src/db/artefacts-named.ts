/** Which artefacts each case's rows name. */
import { and, eq, isNotNull } from 'drizzle-orm'

import type { Database } from './client.js'
import { inSeries } from './in-series.js'
import { withCase } from './scope.js'
import { cases } from './schema/case.js'
import { evidence } from './schema/entities.js'
import { reports } from './schema/report.js'

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
    const kept = new Set([...stored, ...sent.flatMap((row) => frozenFigures(row.frozen))])
    named.set(one.id, { stored, kept })
  }
  return named
}

/** The digest of every figure a frozen report tree places, whatever else the tree holds. */
export function frozenFigures(tree: unknown): string[] {
  const sections = (tree as { sections?: unknown } | null)?.sections
  if (!Array.isArray(sections)) return []
  return sections.flatMap((section: { nodes?: unknown } | null) =>
    Array.isArray(section?.nodes)
      ? section.nodes.flatMap((node: { type?: unknown; hash?: unknown } | null) =>
          node?.type === 'figure' && typeof node.hash === 'string' ? [node.hash] : [],
        )
      : [],
  )
}

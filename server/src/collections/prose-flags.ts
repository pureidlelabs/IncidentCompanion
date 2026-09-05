/**
 * Whether each block of a report has anything written in it.
 *
 * **A named function because the answer needs the case scope, and forgetting
 * it fails silently.** The block rows come back through `withCase`, so they
 * arrive; the reports they belong to were read on the bare handle, where
 * row-level security refuses every row. Zero documents means every block reads
 * empty -- measured against the running server: 21 blocks, 0 documents, and a
 * rail that marked three sections empty with their prose on screen beside it.
 *
 * The wrong version returns a well-formed answer, so nothing downstream can
 * tell it apart from a report nobody has typed into.
 */
import { eq } from 'drizzle-orm'
import * as Y from 'yjs'

import type { Database, Transaction } from '../db/client.js'
import { withCase } from '../db/scope.js'
import { reports } from '../db/schema/index.js'
import { hasProse } from '../domain/prose-fields.js'
import { textOf } from '../domain/text-of.js'

/** Each row, with `hasProse` derived from its report's document. */
export async function withProseFlags(
  db: Database,
  caseId: string,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const documents = await withCase(db, caseId, (tx: Transaction) =>
    tx
      .select({ id: reports.id, document: reports.document })
      .from(reports)
      .where(eq(reports.caseId, caseId)),
  )

  const docs = new Map<string, Y.Doc>()
  for (const row of documents) {
    const doc = new Y.Doc({ gc: false })
    if (row.document) Y.applyUpdate(doc, new Uint8Array(row.document))
    docs.set(row.id, doc)
  }

  return rows.map((row) => {
    const doc = docs.get(textOf(row['reportId']))
    return { ...row, hasProse: doc ? hasProse(doc, textOf(row['id'])) : false }
  })
}

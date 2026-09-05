/**
 * Whether each block of a report has anything written in it.
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

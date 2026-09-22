/** Which artefacts the evidence rows say this install holds. */
import { isNotNull } from 'drizzle-orm'

import type { Database } from './client.js'
import { withCase } from './scope.js'
import { cases } from './schema/case.js'
import { evidence } from './schema/entities.js'

/** Every digest a stored evidence row names, across every case, once each. */
export async function artefactsNamed(db: Database): Promise<Set<string>> {
  const open = await db.select({ id: cases.id }).from(cases)
  const named = new Set<string>()
  for (const one of open) {
    const rows = await withCase(db, one.id, (tx) =>
      tx.select({ hash: evidence.hash }).from(evidence).where(isNotNull(evidence.storedAt)),
    )
    // Narrows the column's type: a stored row always has a digest.
    for (const row of rows) if (row.hash) named.add(row.hash)
  }
  return named
}

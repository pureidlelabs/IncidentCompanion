/** Which artefacts the evidence rows say this install holds. */
import { sql } from 'drizzle-orm'

import type { Database } from './client.js'

/** Every digest a stored evidence row names, across every case, once each. */
export async function artefactsNamed(db: Database): Promise<Set<string>> {
  const { rows } = await db.execute<{ hash: string }>(
    sql`select hash from ic_artefacts_named()`,
  )
  return new Set(rows.map((row) => row.hash))
}

/** Which artefacts the evidence rows say this install holds. */
import { sql } from 'drizzle-orm'

import type { Database } from './client.js'

/**
 * Every digest a stored evidence row names, across every case, once each.
 *
 * Asked of the store's own `ic_artefacts_named`, which answers digests and
 * nothing else, because the census and a refused import ask it for nobody.
 */
export async function artefactsNamed(db: Database): Promise<Set<string>> {
  const { rows } = await db.execute<{ hash: string }>(
    sql`select distinct hash from ic_artefacts_named()`,
  )
  return new Set(rows.map((row) => row.hash))
}

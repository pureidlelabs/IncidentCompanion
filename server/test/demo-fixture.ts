/**
 * The demo cases, deleted and written again, for a test that needs them as
 * shipped whatever an earlier test did to them. An install never does this.
 */
import { eq } from 'drizzle-orm'

import type { Database } from '../src/db/client.js'
import { cases } from '../src/db/schema/index.js'
import { DemoContentSeeder } from '../src/demos/content.seeder.js'
import { writeCatalogue } from '../src/demos/seeder.service.js'

/** Returns how many demo cases it wrote. Needs the seed role's handle. */
export async function reseedDemos(seed: Database): Promise<number> {
  return seed.transaction(async (tx) => {
    await tx.delete(cases).where(eq(cases.isDemo, true))
    return writeCatalogue(tx, new DemoContentSeeder())
  })
}

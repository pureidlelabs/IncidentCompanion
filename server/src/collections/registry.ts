/**
 * Every collection's Drizzle table, and the three maps that are slices of it.
 *
 * **The other half of `domain/collections.ts`, split for layering rather than
 * taste.** `domain` may import nothing and `specs` may import only `domain`
 * (`architecture.test.ts`), so the record that carries schemas, screen keys and
 * nouns cannot name a table. `TABLE_OF` is that binding, and being a
 * `Record<Collection, PgTable>` it is total by compilation: a collection added
 * to the record and not here is a type error, and a name here that is not a
 * collection is another one.
 *
 * **Two slices, and their asymmetry is deliberate.** `REVIEWABLE` is every
 * entry, because anything written under a version check can refuse a save.
 * `TABLES` is the bulk half - what a selection may name, and so what exports -
 * and reports have never been in it. Resolving a review through `TABLES` told
 * an analyst that somebody had deleted the report they were editing, and
 * widening `TABLES` to fix that would have made reports bulk-deletable and
 * exportable as a side effect.
 */
import type { PgTable } from 'drizzle-orm/pg-core'

import {
  accounts,
  cloudApps,
  evidence,
  impact,
  malware,
  methods,
  networkIndicators,
  systems,
  timeline,
} from '../db/schema/index.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { actions, caseNotes } from '../db/schema/tracker.js'
import { BULK_TARGETS, type BulkTarget, type Collection } from '../domain/collections.js'

const TABLE_OF: Record<Collection, PgTable> = {
  systems,
  accounts,
  malware,
  network_indicators: networkIndicators,
  impact,
  cloud_apps: cloudApps,
  evidence,
  methods,
  timeline,
  actions,
  casenotes: caseNotes,
  reports,
  report_blocks: reportBlocks,
}

export const REVIEWABLE: Readonly<Record<string, PgTable>> = TABLE_OF

/**
 * The tables a selection, an export or an import may name.
 *
 * **Also what a `refTarget` resolves through** - `reference-check.ts` reads
 * this rather than a map of its own, which was written off the import names
 * (`cloudApps`, `networkIndicators`) while every `refTarget` spells them
 * `cloud_apps` and `network_indicators`. Both lookups missed and the walk
 * dropped the field silently, leaving the only check that a jsonb reference
 * stays inside its own case doing nothing.
 */
export const TABLES = Object.fromEntries(
  BULK_TARGETS.map((name) => [name, TABLE_OF[name]]),
) as Record<BulkTarget, PgTable>

/**
 * What a `refTarget` may resolve through -- a wider set than `TABLES`, and the
 * distinction is the point.
 *
 * **A reference may name a report; a selection may not**, so this is not
 * `TABLES` and widening `bulk` is not the way to add one.
 */
export const REFERENCE_TABLES: Readonly<Record<string, PgTable>> = {
  ...TABLES,
  reports,
}

export { BULK_TARGETS, COLLECTIONS, type BulkTarget, type Collection } from '../domain/collections.js'

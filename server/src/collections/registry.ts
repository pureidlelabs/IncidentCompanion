/**
 * Every collection's Drizzle table, and the three maps that are slices of it.
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

/** Every entity a refused save can be held against. */
export const REVIEWABLE: Readonly<Record<string, PgTable>> = TABLE_OF

/**
 * The tables a selection, an export or an import may name.
 */
export const TABLES = Object.fromEntries(
  BULK_TARGETS.map((name) => [name, TABLE_OF[name]]),
) as Record<BulkTarget, PgTable>

/**
 * What a `refTarget` may resolve through -- a wider set than `TABLES`, and the
 * distinction is the point.
 */
export const REFERENCE_TABLES: Readonly<Record<string, PgTable>> = {
  ...TABLES,
  reports,
}

export { BULK_TARGETS, COLLECTIONS, type BulkTarget, type Collection } from '../domain/collections.js'

/** Every collection's definition, and so every guard a write to it runs, read by every door. */
import type { CollectionDefinition } from './collection.service.js'
import {
  accounts,
  cloudApps,
  evidence,
  impact,
  malware,
  methods,
  networkIndicators,
  systems,
} from '../db/schema/entities.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { timeline } from '../db/schema/timeline.js'
import { actions, caseNotes } from '../db/schema/tracker.js'
import type { Collection } from '../domain/collections.js'
import { reportBlockSchema } from '../domain/entities/report.js'
import { actionSchema, eventSchema } from '../domain/entities/timeline.js'
import { refuseUnservedLanguage } from '../report/language.service.js'

/** A collection ordered by `createdAt`. */
export const ordered = (
  name: CollectionDefinition['name'],
  table: CollectionDefinition['table'],
): CollectionDefinition => ({
  name,
  table,
  orderBy: 'createdAt',
})

export const TIMELINE_COLLECTION: CollectionDefinition = {
  name: 'timeline',
  table: timeline,
  orderBy: 'time',
  // A patch carries no `kind`, so it is checked against the event arm, the wider of the two.
  schemaFor: (values) => (values['kind'] === 'action' ? actionSchema : eventSchema),
}

export const REPORTS_COLLECTION: CollectionDefinition = {
  ...ordered('reports', reports),
  refuseUnservedTerm: refuseUnservedLanguage(),
}

export const REPORT_BLOCKS_COLLECTION: CollectionDefinition = {
  name: 'report_blocks',
  position: 'position',
  orderWithin: 'reportId',
  table: reportBlocks,
  orderBy: 'position',
  // `COLLECTION_SCHEMAS` does not carry this schema; without it the reference check is skipped.
  schemaFor: () => reportBlockSchema,
}

export const DEFINITIONS: Readonly<Record<Collection, CollectionDefinition>> = {
  systems: ordered('systems', systems),
  accounts: ordered('accounts', accounts),
  malware: ordered('malware', malware),
  network_indicators: ordered('network_indicators', networkIndicators),
  impact: ordered('impact', impact),
  cloud_apps: ordered('cloud_apps', cloudApps),
  evidence: ordered('evidence', evidence),
  methods: ordered('methods', methods),
  timeline: TIMELINE_COLLECTION,
  actions: ordered('actions', actions),
  casenotes: ordered('casenotes', caseNotes),
  reports: REPORTS_COLLECTION,
  report_blocks: REPORT_BLOCKS_COLLECTION,
}

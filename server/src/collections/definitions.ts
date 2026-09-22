/**
 * Every collection's definition, and so every guard a write to it runs.
 *
 * **One record, read by every door that writes a collection** -- its
 * controller, the incident import and the merge review. A door that builds its
 * own definition is a door a guard added here never reaches.
 */
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
import { refuseWritesToSentReport } from '../report/freeze.js'
import { refuseUnservedLanguage } from '../report/language.service.js'

/**
 * A collection ordered by `createdAt` - an entity has no clock of its own the
 * way a timeline entry does, and the table's own sorting is client-side.
 */
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
  /** Its own clock, not insertion order - the story is what the analyst reads. */
  orderBy: 'time',
  /**
   * **The only collection that has to answer this**, because its schema is a
   * union and the arm depends on the row's `kind`. An event and an action
   * offer different references - an action has no source host - so checking
   * against the wrong arm would either miss a field or invent one.
   *
   * A patch carries no `kind`, so the event arm is the fallback: it is the
   * wider of the two, and checking a reference an action cannot have costs a
   * lookup that finds nothing to complain about.
   */
  schemaFor: (values) => (values['kind'] === 'action' ? actionSchema : eventSchema),
}

export const REPORTS_COLLECTION: CollectionDefinition = {
  ...ordered('reports', reports),
  refuseIfClosed: refuseWritesToSentReport('id'),
  refuseUnservedTerm: refuseUnservedLanguage(),
}

export const REPORT_BLOCKS_COLLECTION: CollectionDefinition = {
  name: 'report_blocks',
  // Blocks are ordered inside their own report, which is what the
  // `(reportId, position)` index says.
  position: 'position',
  orderWithin: 'reportId',
  table: reportBlocks,
  orderBy: 'position',
  /**
   * Supplied, because `COLLECTION_SCHEMAS` does not carry this one - without
   * it the reference check resolves `undefined` and returns, leaving a
   * figure's `evidenceId` free to name another case's row.
   *
   * **Through `schemaFor` rather than by registering the schema**, which is
   * the narrower door: `COLLECTION_SCHEMAS` also drives `IMPORTABLE` and the
   * published API surface, so registering it would make report blocks
   * importable as a side effect of closing a reference hole.
   */
  schemaFor: () => reportBlockSchema,
  refuseIfClosed: refuseWritesToSentReport('reportId'),
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

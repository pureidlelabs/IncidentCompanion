import type { ReactNode } from 'react'

import { EvidenceContainer } from './EvidenceContainer'
import { ActionsContainer } from './ActionsContainer'
import { ImpactContainer } from './ImpactContainer'
import { MethodsContainer } from './MethodsContainer'
import { EntitiesContainer } from './EntitiesContainer'
import { ComplianceContainer } from './ComplianceContainer'
import { ImportDataContainer } from './ImportDataContainer'
import { ReportContainer } from './ReportContainer'
import { ImportSentinelContainer } from './ImportSentinelContainer'
import { OverviewContainer } from './OverviewContainer'
import {
  CaseArchiveContainer,
  IndicatorsContainer,
  InvestigationGraphContainer,
  KillchainCoverageContainer,
  SearchContainer,
  TimelineGraphContainer,
} from './views'
import { NotesContainer } from './NotesContainer'
import { TimelineContainer } from './TimelineContainer'

/**
 * What each section slug renders, which is the router's business and no one
 * else's.
 *
 * **The other half of `ui/src/components/blocks/case-sections.ts`.** That file
 * carries identity -- what a slug is called and which glyph it takes -- and
 * says in as many words that what a slug *renders* belongs here.
 *
 * A slug absent from both maps renders the not-found state, which is
 * `SectionOutlet`'s job rather than this map's.
 */

/** Sections served by a container over a screen from the `screens/` tier. */
export const ELEMENTS: Readonly<Record<string, ReactNode>> = {
  evidence: <EvidenceContainer />,
  methods: <MethodsContainer />,
  impact: <ImpactContainer />,
  actions: <ActionsContainer />,
  timeline: <TimelineContainer />,
  notes: <NotesContainer />,
  entities: <EntitiesContainer />,
  assets: <EntitiesContainer scope="assets" />,
  accounts: <EntitiesContainer scope="accounts" />,
  network: <EntitiesContainer scope="network" />,
  malware: <EntitiesContainer scope="malware" />,
  'cloud-apps': <EntitiesContainer scope="cloud-apps" />,
  search: <SearchContainer />,
  'investigation-graph': <InvestigationGraphContainer />,
  'timeline-graph': <TimelineGraphContainer />,
  'killchain-coverage': <KillchainCoverageContainer />,
  indicators: <IndicatorsContainer />,
  archive: <CaseArchiveContainer />,
  overview: <OverviewContainer />,
  settings: <OverviewContainer />,
  compliance: <ComplianceContainer />,
  report: <ReportContainer />,
  import: <ImportDataContainer />,
  'import-sentinel': <ImportSentinelContainer />,
}

/**
 * Slugs with no container yet, and what each is waiting for.
 *
 * **Named rather than absent.** A slug missing from both maps is a section
 * nobody decided about, which is the state this pair exists to make
 * impossible: `every-section-has-a-container.rule.test.ts` requires every rail
 * row to appear in one map or the other.
 */
export const NOT_YET: Readonly<Record<string, string>> = {
  // Empty, and kept rather than deleted: the ratchet asks that every rail
  // slug appear in one map or the other, so a section added without a
  // container has somewhere to be declared and a reason to carry.
}

/**
 * The element for a slug.
 *
 * `undefined` would mean a slug with no container, which
 * `every-section-has-a-container.rule.test.ts` refuses -- so in a tree that
 * passes, the only caller reaching the fall-through is one asking about a slug
 * the rail does not offer.
 */
export function elementFor(slug: string | undefined): ReactNode | undefined {
  return slug === undefined ? undefined : ELEMENTS[slug]
}

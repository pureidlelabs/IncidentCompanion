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
  TimelineGraphContainer,
} from './views'
import { NotesContainer } from './NotesContainer'
import { TimelineContainer } from './TimelineContainer'

/**
 * What each section slug renders, which is the router's business and no one
 * else's.
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
 */
export const NOT_YET: Readonly<Record<string, string>> = {
  // Empty, and kept rather than deleted: the ratchet asks that every rail
  // slug appear in one map or the other, so a section added without a
  // container has somewhere to be declared and a reason to carry.
}

/**
 * The element for a slug.
 */
export function elementFor(slug: string | undefined): ReactNode | undefined {
  return slug === undefined ? undefined : ELEMENTS[slug]
}

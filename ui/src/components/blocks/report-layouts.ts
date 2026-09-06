import type { Report } from '@/api/model'
import { BLANK_LAYOUT, type LayoutBlock, type ReportLayout } from '@/api/reportLayouts'
import { reportBlockLabels } from '@/fixtures/reportBlockKinds'

/**
 * The report shapes an install offers, as `GET /api/report-layouts` serves
 * them.
 *
 * **A registry, not a list in a screen.** Layouts, stages, markings and
 * languages are drop-in files the server discovers; a screen holding any of
 * their names means an analyst's own file needs a code change to appear. This
 * module is what a screen reads instead, and
 * `report-layouts.test.ts` fails a screen that spells a layout's name or label
 * into its source.
 *
 * Captured from the shipped registry rather than invented: its layouts, the
 * Article 23 stages, and TLP 2.0's markings.
 */

/**
 * The heading keys the English pack resolves.
 *
 * The real answer arrives with the report. A key the map does not hold falls
 * through to the key itself, which is what marks a heading as not final -
 * inventing English words client-side is how a Dutch report grows an English
 * heading.
 */
export const HEADING_LABELS: Readonly<Record<string, string>> = {
  'heading.case_header': 'Case',
  'heading.metrics': 'Response metrics',
  'heading.timeline': 'Timeline of events',
  'heading.entities': 'Assets, accounts and indicators',
  'heading.glossary': 'Terms used in this report',
  'heading.ribbon': 'Attack progression',
  'heading.exec_card': 'Summary',
  'heading.killchain': 'Kill chain coverage',
  'heading.techniques': 'Techniques and sub-techniques',
  'heading.technique_table': 'Techniques observed',
  'heading.narrative': 'Incident narrative',
  'heading.root_cause': 'Root cause',
  'heading.evidence': 'Evidence',
  'heading.actions': 'Response actions',
  'heading.impact': 'Impact',
  'heading.indicators': 'Indicators of compromise',
  'heading.exec_summary': 'Executive summary',
  'heading.analysis': 'Analysis',
  'heading.recommendations': 'Recommendations',
  'heading.what_happened': 'What happened',
  'heading.what_we_did': 'What we did',
  'heading.what_we_recommend': 'What we recommend',
  'heading.initial_assessment': 'Initial assessment',
  'heading.status_update': 'Status update',
  'heading.what_is_still_open': 'What is still open',
  'heading.cross_border_impact': 'Cross-border impact',
  'heading.analyst_notes': 'Analyst notes',
  'heading.figure': 'Figure',
}

/** One section a layout prescribes, before the server resolves its label. */
interface Seed {
  kind: string
  headingKey?: string
  /** Losing it makes the report incomplete. What a regulatory article asks for. */
  required?: boolean
}

/** A layout as the registry file holds it. */
interface LayoutSeed {
  name: string
  label: string
  summary: string
  position: number
  /** The feature this layout needs. `nis2` is the only one an install can turn off. */
  requiresFeature?: string
  /** The reporting step this layout *is*, where it is one of them. */
  stage?: Stage
  blocks: readonly Seed[]
}

const SHIPPED: readonly LayoutSeed[] = [
  {
    name: 'standard',
    label: 'Customer RCA',
    summary:
      'The full account, written for the customer. Your own sections sit between the derived ones.',
    position: 10,
    blocks: [
      { kind: 'case_header' },
      { kind: 'written', headingKey: 'heading.exec_summary' },
      { kind: 'ribbon' },
      { kind: 'techniques' },
      { kind: 'root_cause' },
      { kind: 'written', headingKey: 'heading.analysis' },
      { kind: 'timeline' },
      { kind: 'technique_table' },
      { kind: 'entities' },
      { kind: 'written', headingKey: 'heading.recommendations' },
    ],
  },
  {
    name: 'executive',
    label: 'Executive briefing',
    summary:
      'One page for a management audience: the figures and the shape of the attack, and nothing to look up.',
    position: 20,
    blocks: [
      { kind: 'exec_card' },
      { kind: 'written', headingKey: 'heading.what_happened' },
      { kind: 'ribbon' },
      { kind: 'written', headingKey: 'heading.what_we_did' },
      { kind: 'written', headingKey: 'heading.what_we_recommend' },
    ],
  },
  {
    name: 'technical',
    label: 'Technical appendix',
    summary:
      'Everything, in the order an investigator would re-walk it. For another analyst to check your work.',
    position: 30,
    blocks: [
      { kind: 'case_header' },
      { kind: 'narrative' },
      { kind: 'root_cause' },
      { kind: 'killchain' },
      { kind: 'timeline' },
      { kind: 'entities' },
      { kind: 'glossary' },
      { kind: 'written', headingKey: 'heading.analyst_notes' },
    ],
  },
  {
    name: 'nis2-early-warning',
    stage: 'NIS2 early warning',
    label: 'NIS2 early warning',
    summary:
      'Article 23, filed within 24 hours: whether the incident looks malicious, and whether it crosses a border.',
    position: 38,
    requiresFeature: 'nis2',
    blocks: [
      { kind: 'case_header', required: true },
      { kind: 'written', headingKey: 'heading.initial_assessment', required: true },
    ],
  },
  {
    name: 'nis2-notification',
    stage: 'NIS2 notification',
    label: 'NIS2 notification',
    summary:
      'Filed at 72 hours and superseding the early warning: an initial assessment of severity and impact.',
    position: 39,
    requiresFeature: 'nis2',
    blocks: [
      { kind: 'case_header', required: true },
      { kind: 'impact', required: true },
      { kind: 'written', headingKey: 'heading.initial_assessment', required: true },
      { kind: 'indicators' },
    ],
  },
  {
    name: 'nis2-intermediate',
    stage: 'NIS2 intermediate',
    label: 'NIS2 intermediate',
    summary:
      'A progress update while the incident is still open: where it stands, and what is still unanswered.',
    position: 40,
    requiresFeature: 'nis2',
    blocks: [
      { kind: 'case_header', required: true },
      { kind: 'timeline' },
      { kind: 'written', headingKey: 'heading.status_update', required: true },
      { kind: 'written', headingKey: 'heading.what_is_still_open' },
    ],
  },
  {
    name: 'nis2-final',
    stage: 'NIS2 final',
    label: 'NIS2 final report',
    summary: 'The closing filing: root cause, the impact as measured, and the measures taken.',
    position: 41,
    requiresFeature: 'nis2',
    blocks: [
      { kind: 'case_header', required: true },
      { kind: 'impact', required: true },
      { kind: 'root_cause', required: true },
      { kind: 'written', headingKey: 'heading.analysis' },
      { kind: 'timeline' },
      { kind: 'actions', required: true },
      { kind: 'entities' },
      { kind: 'evidence' },
      { kind: 'written', headingKey: 'heading.cross_border_impact', required: true },
    ],
  },
  {
    name: BLANK_LAYOUT,
    label: 'Blank',
    summary: 'No sections. Add them yourself as the investigation produces them.',
    // Last, whatever else is dropped in beside it: a shape that makes nothing
    // is the answer to "none of these", and that answer belongs at the end.
    position: 9_000,
    blocks: [],
  },
]

/** What a chip says: the resolved heading, in the language asked for. */
function chipLabel(seed: Seed): string {
  if (seed.headingKey !== undefined) {
    return HEADING_LABELS[seed.headingKey] ?? seed.headingKey
  }
  return reportBlockLabels[seed.kind] ?? seed.kind
}

function resolve(seed: LayoutSeed): ReportLayout {
  const blocks: LayoutBlock[] = seed.blocks.map((block, position) => ({
    kind: block.kind,
    position,
    heading: '',
    headingKey: block.headingKey ?? '',
    label: chipLabel(block),
  }))
  return {
    name: seed.name,
    label: seed.label,
    summary: seed.summary,
    builtin: true,
    nis2: seed.requiresFeature === 'nis2',
    ...(seed.stage === undefined ? {} : { stage: seed.stage }),
    blocks,
  }
}

/** Every shape this install ships with, in the order the registry serves them. */
export const DEMO_LAYOUTS: readonly ReportLayout[] = [...SHIPPED]
  .sort((left, right) => left.position - right.position)
  .map(resolve)

/** A reporting stage, as the case document stores one. */
export type Stage = NonNullable<Report['stage']>

/** A sharing marking, as the case document stores one. */
export type Marking = NonNullable<Report['tlp']>

/**
 * `models.REPORT_STAGES`.
 *
 * **The empty row belongs to the control, not to the vocabulary.** A report
 * with no stage stores nothing rather than an empty stage, so a blank member
 * here would be a fifth value every consumer had to special-case.
 */
export const DEMO_STAGES: readonly Stage[] = [
  'NIS2 early warning',
  'NIS2 notification',
  'NIS2 intermediate',
  'NIS2 final',
]

/**
 * TLP 2.0, and deliberately not STIX's markings - that vocabulary encodes TLP
 * 1.0, so reaching for it ships a report marked `TLP:WHITE`.
 */
export const DEMO_TLP: readonly Marking[] = [
  'TLP:CLEAR',
  'TLP:GREEN',
  'TLP:AMBER',
  'TLP:AMBER+STRICT',
  'TLP:RED',
]

/**
 * What this install offers, which is not everything it ships.
 *
 * **Keyed on the layout's own flag, never on its name.** A regulatory filing
 * and a customer RCA are different documents; an analyst's own drop-in lands
 * on the right side of the line without this file knowing it exists, and a
 * layout called *BSI Meldung* is a filing while one called *NIS2 explainer*
 * is not.
 */
export function layoutsOffered(
  layouts: readonly ReportLayout[],
  nis2Enabled: boolean,
): ReportLayout[] {
  return layouts.filter((layout) => nis2Enabled || !layout.nis2)
}

/**
 * The layouts a search leaves.
 *
 * **Matched on the chips as well as the name and the line under it.** An
 * analyst looking for the layout that carries a timeline knows the word
 * *timeline* and not which of seven documents includes one, so a search reading
 * titles alone answers the question they already knew the answer to.
 */
export function layoutsMatching(
  layouts: readonly ReportLayout[],
  search: string,
): ReportLayout[] {
  const needle = search.trim().toLowerCase()
  if (needle === '') return [...layouts]
  return layouts.filter((layout) =>
    [layout.label, layout.summary, ...layout.blocks.map((block) => block.label)].some((one) =>
      one.toLowerCase().includes(needle),
    ),
  )
}

/**
 * The reporting stage a layout already is, or `''` for one that is not a
 * filing.
 *
 * The four NIS2 layouts are the four Article 23 steps, and each one's label is
 * the stage word for word -- so the stage was never a second question. A
 * picker beside them asked the analyst to restate the card they had just
 * clicked.
 */
export function stageOf(layout: ReportLayout | undefined, nis2Enabled: boolean): string {
  if (!nis2Enabled || !(layout?.nis2 ?? false)) return ''
  return layout?.stage ?? ''
}

/**
 * The Add menu's vocabulary, captured from `GET /api/report-block-kinds`
 * against a scratch app root: six groups, eighteen kinds, English labels.
 */

import type { BlockKindGroup } from '@/api/reportBlockKinds'

export const reportBlockKinds: BlockKindGroup[] = [
  { heading: 'Write your own', kinds: [
    { kind: 'written', label: 'Written section' },
    { kind: 'figure', label: 'Figure' },
  ] },
  { heading: 'The case in short', kinds: [
    { kind: 'case_header', label: 'Case' },
    { kind: 'exec_card', label: 'Summary' },
    { kind: 'metrics', label: 'Response metrics' },
    { kind: 'impact', label: 'Impact' },
  ] },
  { heading: 'What happened', kinds: [
    { kind: 'timeline', label: 'Timeline of events' },
    { kind: 'narrative', label: 'Incident narrative' },
    { kind: 'ribbon', label: 'Attack progression' },
    { kind: 'techniques', label: 'Techniques and sub-techniques' },
    { kind: 'technique_table', label: 'Techniques observed' },
    { kind: 'killchain', label: 'Kill chain coverage' },
    { kind: 'root_cause', label: 'Root cause' },
  ] },
  { heading: 'What we found', kinds: [
    { kind: 'entities', label: 'Assets, accounts and indicators' },
    { kind: 'indicators', label: 'Indicators of compromise' },
    { kind: 'evidence', label: 'Evidence' },
    { kind: 'methods', label: 'Methods' },
  ] },
  { heading: 'What we did', kinds: [
    { kind: 'actions', label: 'Response actions' },
  ] },
  { heading: 'Reference', kinds: [
    { kind: 'glossary', label: 'Terms used in this report' },
  ] },
]

/** `{kind: label}`, for a story feeding `ReportIndex`'s chips. */
export const reportBlockLabels: Record<string, string> = Object.fromEntries(
  reportBlockKinds.flatMap((group) => group.kinds.map((kind) => [kind.kind, kind.label])),
)

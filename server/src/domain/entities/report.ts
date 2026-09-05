/**
 * A report, and the blocks it is built from.
 */
import { z } from 'zod'

import { field, identityReference } from '../field-spec.js'
import { optionalChoice } from '../vocabularies.js'

/**
 * What a report is for, in the regime's own words.
 */
export const REPORT_STAGES = [
  'NIS2 early warning',
  'NIS2 notification',
  'NIS2 intermediate',
  'NIS2 final',
] as const

/** Sharing terms, printed on the document. */
export const TLP_LABELS = [
  'TLP:CLEAR',
  'TLP:GREEN',
  'TLP:AMBER',
  'TLP:AMBER+STRICT',
  'TLP:RED',
] as const

export const REPORT_STATUSES = ['draft', 'final'] as const

/**
 * The sections a report can hold.
 */
export const BLOCK_KINDS = [
  'written',
  'figure',
  'case_header',
  'metrics',
  'timeline',
  'entities',
  'ribbon',
  'exec_card',
  'narrative',
  'killchain',
  'root_cause',
  'glossary',
  'evidence',
  'actions',
  'impact',
  'indicators',
  'techniques',
  'technique_table',
  'methods',
] as const

/** The kinds whose content an analyst writes rather than the app generating. */
export const AUTHORED_KINDS = ['written', 'figure'] as const

const text = (max: number) => z.string().trim().max(max).default('')

export const reportSchema = z.object({
  label: field(z.string().trim().min(1, 'A report needs a name.').max(200), {
    label: 'Report name',
    kind: 'text',
    fullWidth: true,
  }),

  /** Which layout it was seeded from. Not a live link - layouts change. */
  template: field(text(120), { label: 'Layout', kind: 'select' }),

  stage: field(optionalChoice(REPORT_STAGES), {
    label: 'Regulatory stage',
    kind: 'select',
    vocabulary: 'reportStage',
    section: {
      title: 'Filing',
      copy: 'Only for a report that goes to an authority.',
    },
  }),

  tlp: field(optionalChoice(TLP_LABELS), {
    label: 'Sharing (TLP)',
    kind: 'select',
    vocabulary: 'tlp',
  }),

  /** Which language pack renders it. The customer's, not the analyst's. */
  language: field(text(16), { label: 'Language', kind: 'select', vocabulary: 'reportLanguage' }),

  style: field(text(64), { label: 'Style', kind: 'select', subordinate: true }),

  /**
   * The analyst's own label, and **not the filing**.
   */
  status: field(z.enum(REPORT_STATUSES).default('draft'), {
    label: 'Status',
    kind: 'select',
    vocabulary: 'reportStatus',
    subordinate: true,
  }),
})

export type ReportWrite = z.infer<typeof reportSchema>

export const reportBlockSchema = z.object({
  /**
   * The report this section belongs to.
   */
  reportId: identityReference(z.uuid(), 'reports'),

  /** Draw order. Contiguous is not required; gaps survive a reorder. */
  position: z.number().int().min(0).default(0),

  kind: field(z.enum(BLOCK_KINDS).default('written'), {
    label: 'Section',
    kind: 'select',
    vocabulary: 'blockKind',
  }),

  /**
   * **A heading the analyst typed**, where `headingKey` is one the language pack
   * supplies.
   */
  heading: field(text(200), { label: 'Heading', kind: 'text', fullWidth: true }),
  headingKey: field(text(120), { label: 'Heading key', kind: 'text', subordinate: true }),

  /**
   * Which evidence image a `figure` block draws.
   *
   * **`refTarget` is what the case-boundary check reads.**
   * `danglingReferences` finds a reference by reading this descriptor, so a
   * bare `z.uuid()` here is a foreign key the check cannot see - and the
   * database's own key is enforced outside row-level security, so another
   * case's id is stored rather than refused.
   */
  evidenceId: field(z.uuid().nullish(), {
    label: 'Image',
    // `device_select` is the vocabulary's name for one reference. The report
    // screen draws it as `FigureField` - a thumbnail over the evidence rows
    // that carry an image - so this is what the *kind* is, not what renders it.
    kind: 'device_select',
    refTarget: 'evidence',
    subordinate: true,
  }),
})

export type ReportBlockWrite = z.infer<typeof reportBlockSchema>

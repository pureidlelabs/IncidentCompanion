/**
 * A report, and the blocks it is built from.
 *
 * **The written prose is not here.** A block declares what it *is* and where
 * it sits; its words live in the report's Yjs document, one document per
 * report with a fragment per block.
 *
 * **`frozen` is a rendered tree, not degraded markdown** - a frozen report is
 * what was actually sent, so it is stored as the node tree a painter can
 * reproduce exactly rather than as markdown to be re-parsed.
 *
 * **`sentAt`, `frozen`, `frozenAt` and `document` are deliberately not in the
 * schema.** A field here is a field the collection PATCH can set, and that
 * path would stamp a report sent without producing `frozen` - which exports
 * re-resolved from live case data for ever, and which `send` then refuses as
 * already sent. -> `report/freeze.ts`, `report/lifecycle.service.ts`
 *
 * **Block kinds are this product's own vocabulary**, unlike the RSIT taxonomy
 * or the ENISA weights.
 */
import { z } from 'zod'

import { field, identityReference } from '../field-spec.js'
import { optionalChoice } from '../vocabularies.js'

/**
 * What a report is for, in the regime's own words.
 *
 * **Empty is a real stage**: most reports are not a regulatory filing at all,
 * and forcing one to claim it is would put a false stage on an internal
 * document.
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
 *
 * **Two of them carry words the analyst wrote** - `written` and `figure`.
 * Every other kind is generated from the case at render time, which is why a
 * block has no body of its own: there would be nothing to put in it.
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
   * The analyst's own label, and **not the filing**. `draft`/`final` is what
   * they call the document; sent is `sentAt`, which no client may write.
   * `send` sets both, and a sent report refuses this like every other field -
   * `report/freeze.ts` closes the row rather than the column.
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
   *
   * **Written by the client and not inferred from the URL.** The collection
   * route is `/cases/:id/report_blocks` - it knows the case, not which of the
   * case's reports the analyst is looking at, and a block with the wrong parent
   * is a section that appears in somebody else's document.
   *
   * **`identityReference`, not `field`**: it draws no control, and the target
   * is still what `danglingReferences` reads to keep it inside the case. The
   * foreign key does not stand in for that check -- it is enforced outside
   * row-level security. -> `collections/reference-check.test.ts`
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
   * **A heading the analyst typed**, where `headingKey` is one the language
   * pack supplies. Both exist because a generated section wants a translated
   * title and a written one wants the analyst's own words.
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
   *
   * **Optional at every layer.** Every other block kind leaves it null, and a
   * figure whose evidence was deleted has it nulled by the foreign key - which
   * the resolver draws as a caption saying so rather than refusing.
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

/**
 * The report shapes this install ships with.
 *
 * A layout is data, not code: these are upserted into the library like the
 * case templates, an analyst duplicates one and edits the copy, and nothing
 * enumerates them by name.
 */

/** One section a layout prescribes. */
export interface LayoutBlock {
  kind: string
  /**
   * A literal title, for a layout that names a section outright rather than
   * through the packs. No shipped layout uses one -- a hardcoded English
   * heading is what `headingKey` exists to avoid -- but a dropped-in layout may,
   * and the required-section derivation matches on it.
   */
  heading?: string
  /**
   * The language-pack key a generated section takes its heading from. A
   * written block carries one so the analyst's own section still has a title
   * before they type one.
   */
  headingKey?: string
  /**
   * **Whether losing it makes the report incomplete**, which is what
   * `missing-sections` derives and `restore-sections` puts back. An analyst
   * who deletes a non-required block had a reason; a regulatory layout's
   * required ones are what the article asks for.
   */
  required?: boolean
}

export interface BuiltinLayout {
  name: string
  label: string
  /**
   * One line saying what the report is for and who reads it, shown on the card
   * an analyst picks it from.
   *
   * **What it gets you, never what it contains.** The card already draws a chip
   * per section, so a summary listing them is the same information twice at two
   * sizes; what the chips cannot say is who the document is written for.
   */
  summary: string
  position: number
  /**
   * **A layout only offered when a feature is on.** `nis2` is the only value
   * today; the New report form reads it to decide whether to show a stage.
   */
  requiresFeature?: string
  blocks: LayoutBlock[]
}

export const BUILTIN_REPORT_LAYOUTS: readonly BuiltinLayout[] = [
  /**
   * The default shape: a customer-facing RCA. Generated and written blocks
   * alternate, so an analyst's own sections sit between the derived ones.
   *
   * No `metrics` block - the case header strip already carries
   * time-to-detect, dwell, assets and containment.
   */
  {
    name: 'standard',
    label: 'Customer RCA',
    summary: 'The full account, written for the customer. Your own sections sit between the derived ones.',
    position: 10,
    blocks: [
      { kind: 'case_header' },
      { kind: 'written', headingKey: 'heading.exec_summary' },
      { kind: 'ribbon' },
      // Under the attack progression: the technique ids are a detail of the
      // phase walk, not a lead the summary owns.
      { kind: 'techniques' },
      { kind: 'root_cause' },
      { kind: 'written', headingKey: 'heading.analysis' },
      { kind: 'timeline' },
      // The timeline sliced by technique: count and first/last-seen span.
      { kind: 'technique_table' },
      { kind: 'entities' },
      { kind: 'written', headingKey: 'heading.recommendations' },
    ],
  },
  {
    name: 'executive',
    label: 'Executive briefing',
    summary: 'One page for a management audience: the figures and the shape of the attack, and nothing to look up.',
    position: 20,
    /**
     * One page for a management audience: the figures, the shape of the
     * attack, and nothing an executive would have to look up.
     *
     * **No timeline table and no entity tables** - those are the appendix's
     * job, and a briefing carrying them is a briefing nobody finishes.
     */
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
    summary: 'Everything, in the order an investigator would re-walk it. For another analyst to check your work.',
    position: 30,
    /**
     * Everything, in the order an investigator would re-walk it.
     *
     * **The narrative block is here rather than in the other two** because it
     * grows with the case - the one visual that is not bounded, and a page
     * scrolls and prints the way its axis runs.
     */
    blocks: [
      { kind: 'case_header' },
      { kind: 'narrative' },
      { kind: 'root_cause' },
      { kind: 'killchain' },
      { kind: 'timeline' },
      { kind: 'entities' },
      /**
       * **After the findings and before the glossary.** This layout's own
       * summary says it is for another analyst to check your work, and what it
       * lacked was how each finding was obtained.
       */
      { kind: 'methods' },
      { kind: 'glossary' },
      { kind: 'written', headingKey: 'heading.analyst_notes' },
    ],
  },
  /**
   * Every query and collection step behind the findings, standing alone.
   *
   * **A layout, not a document type.** One `methods` block serves the appendix
   * inside an RCA, the technical appendix and this; the audiences differ and
   * the section does not. Right for a regulator or an incoming analyst, and
   * wrong as the only home, because a reader of the RCA would then have no way
   * to see that a claim was established at all.
   */
  {
    name: 'methods-pack',
    label: 'Methods pack',
    summary: 'Every query and collection step behind the findings, with its window and what it returned.',
    position: 31,
    blocks: [
      { kind: 'case_header' },
      { kind: 'methods' },
      { kind: 'evidence' },
      { kind: 'written', headingKey: 'heading.analyst_notes' },
    ],
  },
  /**
   * Article 23's early warning, due within 24 hours of becoming aware of a
   * significant incident. The article asks only whether the incident is
   * suspected of being malicious and whether it could have cross-border
   * impact - both header flags - so this is deliberately the shortest layout
   * in the app.
   */
  {
    name: 'nis2-early-warning',
    label: 'NIS2 early warning',
    summary: 'Article 23, filed within 24 hours: whether the incident looks malicious, and whether it crosses a border.',
    position: 38,
    requiresFeature: 'nis2',
    blocks: [
      { kind: 'case_header', required: true },
      { kind: 'written', headingKey: 'heading.initial_assessment', required: true },
    ],
  },
  {
    name: 'nis2-notification',
    label: 'NIS2 notification',
    summary: 'Filed at 72 hours and superseding the early warning: an initial assessment of severity and impact.',
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
    label: 'NIS2 intermediate',
    summary: 'A progress update while the incident is still open: where it stands, and what is still unanswered.',
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
]

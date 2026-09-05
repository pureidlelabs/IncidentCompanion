/**
 * An evidence image the analyst placed in the report.
 */
import type { FigureNode, Node } from './model.js'
import type { ReportBlock, ReportInput } from './resolve.js'

/** The columns of an evidence row this block reads. */
interface EvidenceRow {
  id: string
  name?: string | null
  location?: string | null
  hash?: string | null
}

/**
 * The caption: the evidence record's own name - never the section heading, so
 * retitling a section leaves the figure identified - and twelve hex characters
 * of the digest, which is what the evidence table prints.
 */
function captionFor(row: EvidenceRow): string {
  const named = row.name || row.location || row.id
  return row.hash ? `${named} \u00b7 ${row.hash.slice(0, 12)}` : named
}

export function figure(input: ReportInput, block: ReportBlock): Node[] {
  const caption = (text: string, extra?: Partial<FigureNode>): Node[] => [
    { type: 'figure', caption: text, widthPt: 0, heightPt: 0, ...extra },
  ]

  if (!block.evidenceId) return caption(input.t('figure.unplaced'))

  const row = (input.caseData?.evidence ?? []).find(
    (one) => (one as EvidenceRow).id === block.evidenceId,
  ) as EvidenceRow | undefined

  // **The record is gone, which the foreign key makes a real state.** Deleting
  // the evidence nulls this block's reference, so an id that resolves to
  // nothing means the case data handed to this render is missing a row rather
  // than that somebody deleted an artefact.
  if (!row) return caption(input.t('figure.missing'))

  // Recorded where the artefact is held, without holding it - a perfectly
  // ordinary evidence row, and nothing to draw.
  if (!row.hash) return caption(captionFor(row), { note: input.t('figure.unavailable') })

  /**
   * **The size is filled in later and deliberately left at zero here, with no
   * note.**
   */
  return caption(captionFor(row), { hash: row.hash })
}

import type { Case, Report, ReportBlock } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { reportBlockLabels } from '@/fixtures/reportBlockKinds'

import { HEADING_LABELS } from './report-layouts'

/**
 * What the three report screens agree about a report before any of them draws
 * one.
 *
 * The index, the editor and the preview each answer a different question about
 * the same rows, and every one of them needs the lifecycle label, the running
 * order and the heading. Written three times they drift, which is the defect
 * the app's own `reportState.ts` was extracted to end.
 *
 * **Sent is not a stored status.** The server stores `draft` and `final`;
 * `sentAt` being set is an irreversible freeze, so a third stored value would
 * be a second source of truth the freeze could drift from.
 */
export type ReportState = 'Draft' | 'Final' | 'Sent'

/** Every stage a report moves through, in order. */
export const REPORT_STATES: readonly ReportState[] = ['Draft', 'Final', 'Sent']

/** The kinds an analyst writes into. Everything else is composed at export. */
export const WRITTEN_KINDS: readonly string[] = ['written', 'figure']

/** The lifecycle label. `sentAt` wins over the stored status, always. */
export function stateOf(report: Report): ReportState {
  if (report.sentAt) return 'Sent'
  return report.status === 'final' ? 'Final' : 'Draft'
}

/** Whether this report refuses every edit. */
export function isFrozen(report: Report): boolean {
  return Boolean(report.sentAt)
}

/** One report's blocks, in the order the export prints them. */
export function blocksOf(
  blocks: readonly ReportBlock[],
  reportId: string,
): ReportBlock[] {
  return blocks
    .filter((block) => block.reportId === reportId)
    .slice()
    .sort((left, right) => left.position - right.position)
}

/**
 * What a section is called on screen.
 *
 * A block carries either its own `heading`, a `headingKey` the language pack
 * resolves, or neither - and a written section is untitled until the analyst
 * titles it, so its stored heading is the empty string by design.
 *
 * **The key is not prettified into words here.** The pack resolves it in the
 * report's own language, and inventing an English title client-side is how a
 * Dutch report grows an English heading.
 */
export function headingOf(block: ReportBlock): string {
  if (block.heading) return block.heading
  if (block.headingKey) return HEADING_LABELS[block.headingKey] ?? block.headingKey
  return reportBlockLabels[block.kind] ?? block.kind
}

/** Whether the pack answered, or the key stood in for itself. */
export function headingIsFinal(block: ReportBlock): boolean {
  if (!block.headingKey) return true
  return HEADING_LABELS[block.headingKey] !== undefined
}

/** One row of the rail beside the document. */
export interface RailSection {
  id: string
  /** The number the export prints, from `position` and not from arrival. */
  number: number
  heading: string
  /** A body the analyst writes, as opposed to one the case writes at export. */
  written: boolean
  /** Written and still blank. Never true for a generated section. */
  blank: boolean
}

/**
 * The rail beside one report's document.
 *
 * **The state is what makes this more than a list of links.** A written section
 * that is empty is work outstanding; a generated one never is, because the case
 * writes it at export - so `outstandingIn` decides `blank` rather than a length
 * check here, and a frozen report marks nothing.
 *
 * The heading is `headingOf`, the same source the section's own title uses: a
 * rail naming a section differently from the column beside it is worse than no
 * rail.
 */
export function railSectionsOf(
  report: Report,
  blocks: readonly ReportBlock[],
): RailSection[] {
  const own = blocksOf(blocks, report.id)
  const owed = new Set(outstandingIn(report, own).map((block) => block.id))
  return own.map((block, at) => ({
    id: block.id,
    number: at + 1,
    heading: headingOf(block),
    written: WRITTEN_KINDS.includes(block.kind),
    blank: owed.has(block.id),
  }))
}

/**
 * What the strip over the document says about it: how many sections, and how
 * much of the writing is done.
 *
 * **Only the sections an analyst fills are counted as writing.** A report of
 * nothing but generated sections has no writing to do, so it says nothing
 * rather than reading `0 of 0 written`, and a report that has been sent is a
 * document rather than a to-do list.
 */
export function sectionTally(report: Report, blocks: readonly ReportBlock[]): string {
  const own = blocksOf(blocks, report.id)
  if (own.length === 0) return 'No sections'
  const sections = `${String(own.length)} section${own.length === 1 ? '' : 's'}`
  if (isFrozen(report)) return sections
  const writable = own.filter((block) => WRITTEN_KINDS.includes(block.kind))
  if (writable.length === 0) return sections
  const done = writable.filter((block) => hasProse(block)).length
  return `${sections} \u00b7 ${String(done)} of ${String(writable.length)} written`
}

/** Whether this block holds text an analyst wrote. */
export function hasProse(block: ReportBlock): boolean {
  return (block as { hasProse?: boolean }).hasProse ?? false
}

/**
 * The sections nobody has written yet.
 *
 * **A frozen report owes nothing, whatever is in it.** The document left, and
 * naming a gap there is an instruction to do something the app refuses.
 *
 * **Only the sections the analyst writes count.** A generated section is empty
 * by construction until the export composes it, so counting one sends somebody
 * to write what writes itself.
 */
export function outstandingIn(
  report: Report,
  blocks: readonly ReportBlock[],
): ReportBlock[] {
  if (isFrozen(report)) return []
  return blocks.filter((block) => WRITTEN_KINDS.includes(block.kind) && !hasProse(block))
}

/** The second line of a report row: the stage, when, and how many sections. */
export function metaLine(report: Report, blocks: readonly ReportBlock[]): string {
  const facts: string[] = []
  if (report.stage) facts.push(report.stage)
  const stamp = report.sentAt ?? report.createdAt
  if (stamp) facts.push(`${report.sentAt ? 'sent' : 'created'} ${shortDate(stamp)}`)
  facts.push(`${String(blocks.length)} section${blocks.length === 1 ? '' : 's'}`)
  return facts.join(' \u00b7 ')
}

/**
 * `2026-08-13T12:16:41.775Z` as `13 Aug`.
 *
 * Sliced rather than parsed: `toLocaleDateString` renders in the viewer's zone,
 * so a report created at 23:40 UTC would be dated a day later for half the
 * world and the index would disagree with the export.
 */
export function shortDate(stamp: string): string {
  const parts = stamp.slice(0, 10).split('-')
  if (parts.length !== 3) return stamp.slice(0, 10)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = Number(parts[2])
  const month = months[Number(parts[1]) - 1]
  if (!Number.isFinite(day) || month === undefined) return stamp.slice(0, 10)
  return `${String(day)} ${month}`
}

/**
 * What a generated section can say about itself, from the case already loaded.
 *
 * Deliberately partial: a kind with nothing cheap to say gets no facts rather
 * than a placeholder, because a dash repeated down the column is an explanation
 * paragraph in a smaller font.
 */
export function factsFor(kind: string, kase: Case): string {
  switch (kind) {
    case 'timeline':
      return `${String(kase.timeline.length)} events`
    case 'entities':
      return `${String(
        kase.systems.length + kase.accounts.length + kase.networkIndicators.length,
      )} entities`
    case 'evidence':
      return `${String(kase.evidence.length)} items`
    case 'indicators':
      return `${String(kase.networkIndicators.length)} indicators`
    case 'actions':
      return `${String(kase.actions.length)} actions`
    case 'impact':
      return `${String(kase.impact.length)} records`
    default:
      return ''
  }
}

/**
 * The demo's four reports, with a written section marked as holding prose.
 *
 * The captured document carries no `hasProse`, so every written section reads
 * as blank - which is a real state and not the one an index is interesting on.
 * These are the ids of the sections somebody has written.
 */
const WRITTEN_SO_FAR: ReadonlySet<string> = new Set([
  'e9a1c5e0-a7ca-4e93-9484-15a7e6dcb45d',
  '5c3305f7-9256-4cdc-a8eb-a7adbac1cf78',
])

/**
 * What the two written sections of the demo hold.
 *
 * Two paragraphs and a one-liner: enough for the measure to matter, and short
 * enough that a story is read rather than skimmed. In the app this arrives over
 * the collaboration channel and no row carries a copy of it, which is why
 * `hasProse` is a served flag rather than a length check.
 */
export const DEMO_PROSE: Readonly<Record<string, string>> = {
  'e9a1c5e0-a7ca-4e93-9484-15a7e6dcb45d':
    'A macro-enabled phishing email led to a human-operated ransomware incident that spread domain-wide, exfiltrated finance, HR and directory data, and encrypted four servers and fourteen workstations. The first malicious action is dated 4 August at 07:42; containment completed on 9 August at 18:05.',
  '5c3305f7-9256-4cdc-a8eb-a7adbac1cf78':
    'Meridian Logistics has suffered a significant incident under Article 23. Freight scheduling was unavailable to customers for 31 hours and personal data of 2,180 data subjects was taken.',
}

/** The campaign demo's report rows. */
export const DEMO_REPORTS: readonly Report[] = campaignCase.reports

/**
 * One of them by position, and a fixture that lost a report is a failure rather
 * than an `undefined` rendered as a blank screen.
 */
export function demoReport(at: number): Report {
  const report = DEMO_REPORTS[at]
  if (report === undefined) {
    throw new Error(`the campaign fixture serves no report at ${String(at)}`)
  }
  return report
}

/** Its blocks, with the two written sections marked as written. */
export const DEMO_BLOCKS: readonly ReportBlock[] = campaignCase.reportBlocks.map((block) =>
  WRITTEN_SO_FAR.has(block.id) ? { ...block, hasProse: true } : block,
)

/**
 * The demo's blocks with one heading the pack cannot answer.
 *
 * **An invented key, not an omission from the map above.** Leaving a key the
 * fixture really uses out of `KEY_LABELS` shows the unresolved state on every
 * report story, including the two the maintainer reads first. A key nothing
 * serves belongs to the one story that is about it.
 */
export const BLOCKS_WITH_AN_UNRESOLVED_HEADING: readonly ReportBlock[] = DEMO_BLOCKS.map(
  (block) =>
    block.headingKey === 'heading.recommendations'
      ? { ...block, headingKey: 'heading.lessons_learned' }
      : block,
)

/**
 * How much of a report the analyst has written, 0 to 1.
 *
 * **Only the sections they write count.** A generated section is empty by
 * construction until the export composes it, so counting one would report a
 * finished report as part-done. A report holding none of them is `1`: there is
 * no work in it, rather than none done.
 */
export function writtenShare(report: Report, blocks: readonly ReportBlock[]): number {
  const own = blocksOf(blocks, report.id)
  const written = own.filter((block) => WRITTEN_KINDS.includes(block.kind))
  if (written.length === 0) return 1
  return (written.length - outstandingIn(report, own).length) / written.length
}

/**
 * The demo report content the stories and tests draw.
 *
 * **Here rather than beside the report logic, because it reads the captured
 * case.** A default import of that document is not tree-shaken per key, so one
 * line reading `campaignCase.reports` put the whole capture into the bundle an
 * operator downloads. `fixtures/` is reached by stories and tests and dropped
 * by an app build.
 * -> `fixtures-stay-out-of-the-bundle.rule.test.ts`
 */
import type { Report, ReportBlock } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

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
 * **An invented key, not an omission from the pack.** Leaving a key the
 * fixture really uses out of `DEMO_HEADINGS` shows the unresolved state on
 * every report story, including the two the maintainer reads first. A key
 * nothing serves belongs to the one story that is about it.
 */
export const BLOCKS_WITH_AN_UNRESOLVED_HEADING: readonly ReportBlock[] = DEMO_BLOCKS.map(
  (block) =>
    block.headingKey === 'heading.recommendations'
      ? { ...block, headingKey: 'heading.lessons_learned' }
      : block,
)

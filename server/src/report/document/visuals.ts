/**
 * The blocks that were drawings, as tables.
 *
 * A generated visual is a shaded table, and that is a constraint on the *model*
 * rather than on a painter: each of these returns cells with a fill and an ink,
 * and `.docx`, `.pdf` and `.md` render that their own way. No cell spans a
 * column - a full-width row is a node beside the table. A resolver prints no
 * heading; the block owns that.
 */
import { duration, dwellText, responseClocks } from './derived.js'
import { formatTimestamp } from './labels.js'
import type { Cell, Node } from './model.js'
import { HIGH, INK, MEDIUM, PHASE_SEVERITY, inkOn } from './palette.js'
import type { ReportInput } from './resolve.js'
import type { CaseData } from './sections.js'

/**
 * The columns the timeline row actually carries.
 *
 * Declared here because `CaseData`'s `TimelineRow` carries the two system ids
 * and none of the id arrays -- `account_ids`, `network_indicator_ids`,
 * `malware_ids`. A resolver written from that type reports a lateral movement
 * as touching two machines and nobody's account.
 */
interface Involved {
  tactic?: string | null
  time?: Date | string | null
  systemId?: string | null
  sourceSystemId?: string | null
  accountIds?: string[] | null
  networkIndicatorIds?: string[] | null
  malwareIds?: string[] | null
}

/**
 * Who this block is about, as the line that sits above it - an italic
 * paragraph, never a `subtitle` node, which is the report's own title line and
 * paints as an H1.
 */
function caption(text: string): Node {
  return { type: 'richPara', runs: [{ text, italic: true }] }
}

function subtitleOf(data: CaseData): string {
  return [data.customer, data.reference, data.status].filter(Boolean).join(' \u00b7 ')
}

/**
 * The three figures, large. A missing figure reads "not recorded" and never
 * zero, since every lifecycle stamp is optional. The third is the containment
 * *timestamp* rather than a duration, which the metrics section already prints.
 */
export function execCard(input: ReportInput): Node[] {
  const data = input.caseData
  if (!data) return []
  const missing = input.t('value.not_recorded')

  // **Both figures come from the one helper the metrics section uses.** Derived
  // here as well, from an anchor of its own, the card and the table under it
  // print two different dwell times for one incident.
  const clocks = responseClocks(data)
  const dwell = dwellText(input, clocks)

  const figures: [string, string][] = [
    [
      input.t('metric.time_to_detect'),
      clocks.toDetect === null ? missing : duration(clocks.toDetect),
    ],
    [input.t('metric.dwell'), dwell ?? missing],
    [
      input.t('field.contained'),
      formatTimestamp(data.containedAt, { zone: false }) || missing,
    ],
  ]

  const nodes: Node[] = []
  const subtitle = subtitleOf(data)
  if (subtitle) nodes.push(caption(subtitle))

  nodes.push({
    type: 'table',
    rows: [
      figures.map(([label]) => ({ text: label.toUpperCase(), mono: true, ink: '#6b7280' })),
      figures.map(([, value]) => ({ text: value, bold: true, ink: INK })),
    ],
    // Even thirds: three figures of equal standing, and an uneven split would
    // rank them. **Derived from the count, not written out**: a width is a
    // fraction of the printable width, so a literal `[1, 1, 1]` is a table
    // three pages wide.
    widths: figures.map(() => 1 / figures.length),
  })

  nodes.push({
    type: 'prose',
    paras: [
      // **"In scope", not "affected".** Both halves of this line are catalogue
      // counts and the accounts half already says so; calling the assets half
      // "affected" makes the estate under review read as the blast radius. The
      // determination lives in the metrics table's "Hosts affected".
      `${String((data.systems ?? []).length)} ${input.t('exec.assets_in_scope')} \u00b7 ` +
        `${String((data.accounts ?? []).length)} ${input.t('exec.accounts_involved')}`,
    ],
  })

  return nodes
}

function touchedBy(entry: Involved, names: Map<string, string>): string[] {
  const ids = [
    entry.systemId,
    entry.sourceSystemId,
    ...(entry.accountIds ?? []),
    ...(entry.networkIndicatorIds ?? []),
    ...(entry.malwareIds ?? []),
  ]
  return ids.map((id) => (id ? (names.get(id) ?? '') : '')).filter((name) => name !== '')
}

/**
 * What was touched at each stage the intrusion reached - stages with something
 * in them only, in intrusion order rather than the order entries arrived. Where
 * the rows stop is the whole reading of the block.
 */
export function killchain(input: ReportInput): Node[] {
  const data = input.caseData
  if (!data) return []

  const names = new Map<string, string>()
  for (const row of data.systems ?? []) names.set(row.id, row.hostname ?? '')
  for (const row of data.accounts ?? []) names.set(row.id, row.accountName ?? '')
  // **`ip` or `domain`, whichever the row holds** - the same rule the indicator
  // section prints by, so one indicator is not two different names across a
  // document.
  for (const row of data.networkIndicators ?? []) names.set(row.id, row.value ?? '')
  for (const row of data.malware ?? []) names.set(row.id, row.filename ?? '')

  const atStage = new Map<string, string[]>()
  for (const entry of (data.timeline ?? []) as Involved[]) {
    const stage = (entry.tactic ?? '').toLowerCase()
    const seen = atStage.get(stage) ?? []
    for (const name of touchedBy(entry, names)) {
      if (!seen.includes(name)) seen.push(name)
    }
    atStage.set(stage, seen)
  }

  // Walking the ramp is also what drops an entry whose tactic it does not name;
  // nothing else guards that.
  const order = Object.keys(PHASE_SEVERITY)
  const rows: Cell[][] = []
  for (const stage of order) {
    const touched = atStage.get(stage)
    if (!touched) continue
    const fill = PHASE_SEVERITY[stage] ?? MEDIUM
    rows.push([
      { text: stage, bold: true, fill, ink: inkOn(fill) },
      // Every name here is an entity's own value, so the defang pass may blank
      // it; the free-text rule would not reach a bare domain. One flag covers
      // the cell, so an account name's domain is bracketed here and not in
      // `entities` - mangling a login is the cheaper mistake.
      { text: touched.join(', '), indicator: true },
    ])
  }

  if (rows.length === 0) {
    return [{ type: 'prose', paras: [input.t('value.none')] }]
  }

  const nodes: Node[] = []
  const subtitle = subtitleOf(data)
  if (subtitle) nodes.push(caption(subtitle))
  // A quarter to the stage, the rest to what it touched: the stage names are a
  // fixed vocabulary and the entity list is whatever the case holds. Written as
  // the fractions the painters multiply out rather than as the ratio -- `[1, 3]`
  // is a table four pages wide.
  nodes.push({ type: 'table', rows, widths: [0.25, 0.75] })
  return nodes
}

/**
 * The ribbon's fill for a phase the ramp does not name -- `derived.ts` is its
 * only reader. `killchain` above falls back to `MEDIUM` for the same case, so
 * an unmapped tactic is the top rung in one block and the middle rung in the
 * other.
 */
export const UNKNOWN_STAGE_FILL = HIGH

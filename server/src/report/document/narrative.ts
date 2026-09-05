/**
 * The timeline down the page, as a table.
 */
import { formatTimestamp } from './labels.js'
import type { Cell, Node } from './model.js'
import { BAND, INK, MEDIUM, MUTED, PHASE_SEVERITY, RESPONSE, inkOn } from './palette.js'
import type { ReportInput } from './resolve.js'
import { consecutiveRuns } from './runs.js'

/** The columns of a timeline row this block reads. */
interface Beat {
  time?: Date | string | null
  description?: string | null
  tactic?: string | null
  kind?: string | null
}

/** Milliseconds after which a gap stops being continuous activity. */
const LONG_GAP_MS = 60 * 60 * 1000

/** A description longer than this is cut: the block is a narrative, not the notes. */
const DESCRIPTION_LIMIT = 160

function when(value: unknown): number | null {
  if (!value) return null
  const at = new Date(value as string).getTime()
  return Number.isNaN(at) ? null : at
}

/**
 * The gap between two beats, and whether it is long enough to stand alone: an
 * hour, above which a reader taking the rows as continuous activity is wrong
 * and nothing else on the row says so. Under a minute prints blank, never `+0m`.
 */
function elapsed(from: number, to: number): { text: string; long: boolean } {
  const ms = to - from
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return { text: '', long: false }
  let text: string
  if (minutes < 120) text = `+${String(minutes)}m`
  else if (minutes < 48 * 60) text = `+${String(Math.floor(minutes / 60))}h`
  else text = `+${String(Math.floor(minutes / 1440))}d`
  return { text, long: ms >= LONG_GAP_MS }
}

export function narrative(input: ReportInput): Node[] {
  const data = input.caseData
  if (!data) return []

  // **Entries with no usable time are dropped rather than sorted to the front.**
  // A narrative is the one block whose whole meaning is sequence, and an entry
  // with no position makes a claim about order that nothing supports.
  const placed = ((data.timeline ?? []) as Beat[])
    .map((entry) => ({ entry, at: when(entry.time) }))
    .filter((one): one is { entry: Beat; at: number } => one.at !== null)
    .sort((a, b) => a.at - b.at)

  if (placed.length === 0) {
    return [{ type: 'prose', paras: [input.t('empty.timeline')] }]
  }

  // Keyed on what is said and who said it, so a repeat of the same line by the
  // other side is a separate beat.
  // **Keyed as a pair, not a joined string.** A separator has to be a
  // character the description cannot contain, and there is not one; a
  // repeat of the same line by the other side is a separate beat.
  const beats = consecutiveRuns(placed, (one) =>
    JSON.stringify([one.entry.description ?? "", one.entry.kind ?? ""]),
  )

  const rows: Cell[][] = []
  let previous: number | null = null

  for (const run of beats) {
    const first = run[0]!
    const last = run[run.length - 1]!
    const isAction = first.entry.kind === 'action'
    const fill = isAction
      ? RESPONSE
      : (PHASE_SEVERITY[(first.entry.tactic ?? '').toLowerCase()] ?? MEDIUM)

    let gap = { text: '', long: false }
    if (previous !== null) gap = elapsed(previous, first.at)

    /**
     * **A quiet day is a finding, and it gets a row.**
     */
    if (gap.long) {
      // **The duration goes in the widest column, not the last one.** Painted
      // to markdown the band has no fill to carry it, so a gap parked in the
      // trailing column reads as a stray empty row rather than as a pause.
      rows.push([
        { text: '', fill: BAND },
        { text: '', fill: BAND },
        { text: gap.text, fill: BAND, ink: MUTED, mono: true },
        { text: '', fill: BAND },
      ])
    }

    // A run states the span it covers as a *duration* rather than an end
    // timestamp: repeating a whole date beside a start two minutes earlier is a
    // date to read for one changed digit.
    const covered = run.length > 1 ? elapsed(first.at, last.at).text.replace('+', '') : ''
    const meta = [run.length > 1 ? `\u00d7${String(run.length)}` : '', covered, gap.long ? '' : gap.text]
      .filter(Boolean)
      .join(' \u00b7 ')

    rows.push([
      { text: formatTimestamp(first.entry.time, { zone: false }), mono: true, ink: MUTED },
      // The marker the drawing made a dot: a cell can carry a fill, not a shape.
      { text: '', fill },
      { text: (first.entry.description ?? '').slice(0, DESCRIPTION_LIMIT), ink: isAction ? RESPONSE : INK },
      { text: meta, mono: true, ink: MUTED, align: 'right' },
    ])

    previous = last.at
  }

  /**
   * **Shares, normalised to the fractions every painter multiplies out.**
   */
  const shares = [3, 1, 12, 3]
  const whole = shares.reduce((sum, share) => sum + share, 0)

  return [
    { type: 'table', rows, widths: shares.map((share) => share / whole) },
    /**
     * **The key, in words.**
     */
    {
      type: 'richPara',
      runs: [
        // **One run, not two.** A bold-italic run beside an italic one paints
        // to markdown as `***a . ****b*`, which is not emphasis in any reader.
        {
          text:
            input.t('narrative.our_action') +
            ' \u00b7 ' +
            input.t('narrative.adversary'),
          italic: true,
        },
      ],
    },
  ]
}

/** Kept beside the ramp it reads, so an unmapped tactic is visibly the middle rung. */
export const UNMAPPED_TACTIC_FILL = MEDIUM

/** What a stage cell's ink would be, exposed for the painters' own contrast checks. */
export const inkFor = inkOn

import { isEvent, type Case, type TimelineEntry } from '@/api/model'
import { toneFor, type SeverityTone } from '@/components/blocks/severity-badge'
import { msOf } from '@/lib/case-time'

/**
 * The timeline graph's model: the case as two tracks either side of a clock,
 * with the quiet stretches drawn to scale.
 *
 * **The silences are the content.** A list already carries the sequence; what
 * a picture of it adds is how far apart things were, so a gap is a band with a
 * height rather than the next row down.
 */

/** Which side of the spine a run sits on. */
export type Track = 'observed' | 'response'

export interface CascadeRun {
  key: string
  label: string
  track: Track
  tone: SeverityTone
  /** Epoch milliseconds of the first and last member. */
  start: number
  end: number
  count: number
  phase: string
  entryId: string
  /** The entry's own word, for the badge the popover draws. Empty on a response. */
  severity: string
}

/** A gap of this or more is drawn as a band rather than closed up. */
export const SILENCE_FLOOR_MS = 60 * 60 * 1000

/**
 * A description with the case's own names blanked out.
 *
 * Two entries differing only in which host they name are one kind of event,
 * and folding them is what stops a domain-wide spread drawing thirty
 * identical cards.
 */
export function eventType(description: string, names: readonly string[]): string {
  let text = description
  for (const name of names) {
    if (name.length <= 3) continue
    text = text.split(name).join('\u2026')
  }
  return text.trim()
}

/** Runs of one kind of event, split wherever the case went quiet. */
export function buildCascade(kase: Case): CascadeRun[] {
  const names = [
    ...kase.systems.map((row) => row.hostname),
    ...kase.accounts.map((row) => row.accountName),
  ].filter(Boolean)

  const ordered = [...kase.timeline]
    .filter((entry) => msOf(entry.time) !== null)
    .sort((left, right) => (msOf(left.time) ?? 0) - (msOf(right.time) ?? 0))

  const runs: CascadeRun[] = []
  for (const entry of ordered) {
    const at = msOf(entry.time) ?? 0
    const track: Track = isEvent(entry) ? 'observed' : 'response'
    const key = `${track}:${eventType(entry.description, names)}`
    // Walked backwards rather than `findLast`: the client's target library is
    // older than that method.
    let last: CascadeRun | undefined
    for (let back = runs.length - 1; back >= 0; back -= 1) {
      if (runs[back]?.key === key) {
        last = runs[back]
        break
      }
    }
    if (last !== undefined && at - last.end < SILENCE_FLOOR_MS) {
      last.end = at
      last.count += 1
      continue
    }
    runs.push({
      key,
      label: eventType(entry.description, names),
      track,
      tone: isEvent(entry) ? toneFor(entry.severity) : 'none',
      start: at,
      end: at,
      count: 1,
      phase: (entry.ukcPhase ?? '').trim(),
      entryId: entry.id,
      severity: isEvent(entry) ? (entry.severity ?? '') : '',
    })
  }
  return runs
}

export type CascadeRow =
  | { kind: 'day'; key: string; at: number }
  | { kind: 'silence'; key: string; span: number }
  | { kind: 'milestone'; key: string; label: string; at: number }
  | {
      kind: 'moment'
      key: string
      at: number
      runs: CascadeRun[]
      /** Pixels of empty lane above this moment. */
      spaceBefore: number
    }

/** A stage stamp the case carries, placed on the spine by its own time. */
export interface CascadeMilestone {
  key: string
  label: string
  at: number
}

/**
 * The most space one interval may put between two moments, in pixels.
 *
 * Anything past `SILENCE_FLOOR_MS` becomes a band instead, so this is reached
 * only by a case whose floor has been widened.
 */
export const MAX_EXTRA = 96

/**
 * Pixels of lane between two moments `span` milliseconds apart.
 *
 * **Root, not linear.** A linear rate under a ceiling flattens the common
 * case - past a few minutes everything hits the cap, and ten, twenty and fifty
 * minutes draw the same distance. The root keeps them ordered on screen, which
 * is the claim the section's blurb makes.
 */
export function momentSpace(span: number): number {
  return Math.min(MAX_EXTRA, Math.sqrt(Math.max(0, span) / 1000))
}

/** A moment is a minute: the stamps read `HH:MM` and the axis cannot say finer. */
function minuteOf(at: number): number {
  return Math.floor(at / 60_000) * 60_000
}

export interface CascadeRowOptions {
  milestones?: readonly CascadeMilestone[]
}

/**
 * The runs as a list of rows: a day heading, a silence band, a stage rule, or
 * a moment carrying everything that started at it.
 *
 * A run is placed by its start. Where it ends is on the card, because two
 * rows for one run is a second thing to read for a fact the first already
 * carries.
 *
 * **A silence and a day change are two rows, not a choice between them.** The
 * gap that crosses midnight is the one most worth drawing, and it is exactly
 * the one an `else if` swallows.
 */
export function cascadeRows(
  runs: readonly CascadeRun[],
  { milestones = [] }: CascadeRowOptions = {},
): CascadeRow[] {
  const byStart = new Map<number, CascadeRun[]>()
  for (const run of runs) {
    const at = minuteOf(run.start)
    byStart.set(at, [...(byStart.get(at) ?? []), run])
  }

  const pending = [...milestones].sort((left, right) => left.at - right.at)
  const rule = (one: CascadeMilestone): CascadeRow => ({
    kind: 'milestone',
    key: one.key,
    label: one.label,
    at: one.at,
  })

  const rows: CascadeRow[] = []
  /** Every pending stamp up to `until`, in order. */
  const flush = (until: number, inclusive: boolean) => {
    for (let next = pending[0]; next !== undefined; next = pending[0]) {
      const stamped = minuteOf(next.at)
      if (inclusive ? stamped > until : stamped >= until) break
      pending.shift()
      rows.push(rule(next))
    }
  }

  let previous: number | null = null
  let day = ''
  for (const at of [...byStart.keys()].sort((left, right) => left - right)) {
    // Anything already past goes above the band; anything inside the quiet
    // stretch waits for it, or a detection at the end of a silence sorts above
    // the silence it was measured through.
    if (previous !== null) flush(previous, false)

    let broke = false
    if (previous !== null && at - previous >= SILENCE_FLOOR_MS) {
      broke = true
      rows.push({ kind: 'silence', key: `gap-${String(at)}`, span: at - previous })
    }

    flush(at, true)

    const own = new Date(at).toISOString().slice(0, 10)
    if (own !== day) {
      day = own
      rows.push({ kind: 'day', key: `day-${own}`, at })
    }

    rows.push({
      kind: 'moment',
      key: `at-${String(at)}`,
      at,
      runs: byStart.get(at) ?? [],
      // Nothing after a band: the band already draws that interval, and
      // charged twice a detection sits a canyon from the alert that raised it.
      spaceBefore: previous === null || broke ? 0 : momentSpace(at - previous),
    })
    previous = at
  }
  for (const one of pending) rows.push(rule(one))
  return rows
}

/**
 * How tall a silence band is drawn, in pixels.
 *
 * **Square-rooted and capped.** Linear, a two-day quiet stretch is 48 times a
 * one-hour one and pushes every card below it off the screen; the root keeps
 * the ordering visible while the band stays a band.
 */
export function silenceHeight(span: number, longest: number): number {
  const floor = 26
  const ceiling = 150
  if (longest <= 0) return floor
  return Math.round(floor + (ceiling - floor) * (Math.sqrt(span) / Math.sqrt(longest)))
}

export interface CascadeMetric {
  key: string
  label: string
  value: string
  caption: string
  /** Nothing on the case answers this one. */
  absent: boolean
}

/** The four stage stamps the case document carries, in order. */
export const MILESTONES: readonly { key: string; label: string; field: keyof Case }[] = [
  { key: 'detected', label: 'Detected', field: 'detectedAt' },
  { key: 'contained', label: 'Contained', field: 'containedAt' },
  { key: 'eradicated', label: 'Eradicated', field: 'eradicatedAt' },
  { key: 'recovered', label: 'Recovered', field: 'recoveredAt' },
]

/**
 * The stage stamps this case actually carries, in time order.
 *
 * A stamp nobody set is absent rather than drawn at epoch zero: every demo
 * ships all four `null`, which is the state most cases open in.
 */
export function milestonesOf(kase: Case): CascadeMilestone[] {
  return MILESTONES.map((one) => ({
    key: one.key,
    label: one.label,
    at: msOf(kase[one.field] as string | null),
  }))
    .filter((one): one is CascadeMilestone => one.at !== null)
    .sort((left, right) => left.at - right.at)
}

/**
 * How wide a run's card may run, whichever track it is on.
 *
 * **The cap is what makes the spine readable.** Uncapped, one 125-character
 * description sets the measure for the page and every other card's outer edge
 * zigzags in from it; `w-full` under the cap is what puts the rest back on one
 * line. A single string, so both tracks cannot drift apart.
 */
export const CARD_MEASURE = 'w-full max-w-md'

/** The first thing that happened, whichever track recorded it. */
export function firstMoment(entries: readonly TimelineEntry[]): number | null {
  const stamps = entries.map((entry) => msOf(entry.time)).filter((at): at is number => at !== null)
  return stamps.length > 0 ? Math.min(...stamps) : null
}

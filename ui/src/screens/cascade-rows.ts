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
 * A run lasting this or more is a duration on the axis rather than an instant.
 *
 * A minute, because the stamps read `HH:MM`: anything shorter has one place on
 * this axis, and a second stamp for it prints the same clock twice under a
 * label saying it ended.
 */
export const SPAN_FLOOR_MS = 60 * 1000

/** Whether a run covers enough time for the axis to draw it as a stretch. */
export function spans(run: CascadeRun): boolean {
  return run.end - run.start >= SPAN_FLOOR_MS
}

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
  /**
   * One minute of the incident: what began in it, and what ended in it.
   *
   * **The spine carries moments, and a run's end is one of them.** Drawn only
   * at its start, a run that lasted an hour leaves the silence after it
   * measured from a time nothing on the drawing shows - so `09:23`, `1h 14m`
   * and `11:43` read as arithmetic that does not add up, because the `10:29`
   * it was measured from is invisible.
   *
   * The end is a stamp and never a card: the card belongs to the moment the
   * thing started. It is also why the end cannot be drawn inside the start's
   * own row - placed there it prints `13:15` above the `12:50` that genuinely
   * came next.
   */
  | {
      kind: 'moment'
      key: string
      at: number
      /** Runs beginning here. Their cards draw on this row. */
      runs: CascadeRun[]
      /** Runs ending here. A stamp only. */
      ends: CascadeRun[]
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
 * A run is placed by its start, and a run that lasted is placed again by its
 * end - the axis is time, so a stretch of it has two ends and the drawing owes
 * both. The second row carries no card.
 *
 * **A silence and a day change are two rows, not a choice between them.** The
 * gap that crosses midnight is the one most worth drawing, and it is exactly
 * the one an `else if` swallows.
 */
export function cascadeRows(
  runs: readonly CascadeRun[],
  { milestones = [] }: CascadeRowOptions = {},
): CascadeRow[] {
  const moments = new Map<number, { at: number; runs: CascadeRun[]; ends: CascadeRun[] }>()
  const slot = (at: number) => {
    const key = minuteOf(at)
    const found = moments.get(key)
    if (found) return found
    const made = { at: key, runs: [] as CascadeRun[], ends: [] as CascadeRun[] }
    moments.set(key, made)
    return made
  }
  for (const run of runs) {
    slot(run.start).runs.push(run)
    if (spans(run)) slot(run.end).ends.push(run)
  }

  /**
   * Was anything still running across this stretch?
   *
   * **A run's own duration is not a silence.** With the end drawn as its own
   * moment, the hour between a run's two stamps is a gap wide enough to
   * qualify - so a burst that ran for three hours is labelled quiet while it
   * was the thing that was happening.
   *
   * Floored on both sides, because a moment is a minute: comparing a run's raw
   * stamp against a floored moment makes `12:37:13 <= 12:37:00` false, and the
   * guard never fires.
   */
  const quiet = (from: number, to: number) =>
    !runs.some(
      (run) => spans(run) && minuteOf(run.start) <= from && minuteOf(run.end) >= to,
    )

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
  for (const moment of [...moments.values()].sort((left, right) => left.at - right.at)) {
    const at = moment.at
    // Anything already past goes above the band; anything inside the quiet
    // stretch waits for it, or a detection at the end of a silence sorts above
    // the silence it was measured through.
    if (previous !== null) flush(previous, false)

    let broke = false
    if (previous !== null && at - previous >= SILENCE_FLOOR_MS && quiet(previous, at)) {
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
      runs: moment.runs,
      ends: moment.ends,
      // Nothing after a band: the band already draws that interval, and
      // charged twice a detection sits a canyon from the alert that raised it.
      //
      // **A moment that only ends things is spaced like any other.** It is the
      // one place the elapsed time of a run is drawn at all: zeroed, four
      // hours of beaconing take no lane while the half hour after them takes
      // 42px, so a four-hour run and a two-minute one are the same picture -
      // and the silence band that used to state those four hours is gone, by
      // `quiet()` above, because the case was not quiet. The track's own end
      // piece reaches back over this space, so nothing is left untinted.
      spaceBefore: previous === null || broke ? 0 : momentSpace(at - previous),
    })
    previous = at
  }
  for (const one of pending) rows.push(rule(one))
  return rows
}

/**
 * A lane per lasting run, held for the whole drawing rather than per row.
 *
 * **The offset has to come from the run, not from where it sits in a row's
 * array.** Taking the index and the count from one row moves a track sideways
 * wherever the number of concurrent runs changes: a run alone on its start row
 * and paired on the next is centred, then 3px left, then centred again, so one
 * continuous duration draws with a kink in it at every neighbour's start.
 *
 * Lanes are reused once a run has ended - the lowest one free at that moment -
 * so a case with twenty sequential bursts still draws them all on the spine
 * rather than spreading twenty lanes wide.
 */
export function laneOf(runs: readonly CascadeRun[]): { lane: Map<string, number>; count: number } {
  const lane = new Map<string, number>()
  /** When each open lane frees up. */
  const until: number[] = []
  for (const run of [...runs].filter(spans).sort((left, right) => left.start - right.start)) {
    // **Keyed with the start**, because `buildCascade` gives two runs of one
    // kind the same `key` when a silence splits them.
    let at = until.findIndex((end) => end <= run.start)
    if (at === -1) {
      at = until.length
      until.push(run.end)
    } else {
      until[at] = run.end
    }
    lane.set(`${run.key}@${String(run.start)}`, at)
  }
  return { lane, count: Math.max(1, until.length) }
}

/**
 * Every run still going at a given moment - plural, since concurrent runs need
 * one lane each.
 *
 * **Strictly between its own two stamps.** The track paints whole rows, so
 * including either end row runs it past the stamp it should stop at: a nub
 * above the start time, and a tail under the end marker. Those two rows draw
 * their own piece, from their stamp outward.
 *
 * Lives here rather than in the drawing so a test can hold it: the demo case
 * has no overlapping durations, so nothing on screen exercises the plural.
 */
export function runsSpanning(runs: readonly CascadeRun[], at: number): CascadeRun[] {
  return runs.filter(
    (run) => spans(run) && minuteOf(run.start) < at && minuteOf(run.end) > at,
  )
}

/**
 * Every run still going across a row that is not a moment of its own.
 *
 * **Inclusive of the end, where `runsSpanning` is strict.** A day heading and a
 * stage rule take the timestamp of the moment they sit above, so when that
 * moment is a run's end, the strict question answers "not running" about a row
 * the run is physically still crossing - and the track breaks by the height of
 * the heading, directly above the stamp saying where it stopped.
 */
export function runsCrossing(runs: readonly CascadeRun[], at: number): CascadeRun[] {
  return runs.filter(
    (run) => spans(run) && minuteOf(run.start) < at && minuteOf(run.end) >= at,
  )
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

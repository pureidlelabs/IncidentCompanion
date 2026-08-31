/**
 * A window over a case's own span, and the histogram drawn behind it.
 *
 * Epoch milliseconds throughout, so nothing here knows what a timeline entry
 * is: the kit's `TimeBrush` draws it and the screens tier filters with it.
 *
 * **A second copy of `ui/src/lib/time-window.ts`**, which is the same
 * arithmetic bound to `TimelineEntry` and to Base UI's slider. The screens tier
 * may not import `features/**`, so the two stand until the running app moves
 * onto the kit component, and then this is the one that survives.
 */

/** Milliseconds, inclusive both ends. */
export interface TimeWindow {
  from: number
  to: number
}

/** A minute, so a case whose entries share one instant still has a track. */
const FLAT_SPAN_MS = 60_000

/**
 * First stamp to last. `null` when nothing has a usable time.
 *
 * A zero-width span is widened to a minute: no track can draw a point, and no
 * handle can grab one.
 */
export function spanOf(times: readonly number[]): TimeWindow | null {
  let from = Infinity
  let to = -Infinity
  for (const at of times) {
    if (!Number.isFinite(at)) continue
    if (at < from) from = at
    if (at > to) to = at
  }
  if (from === Infinity) return null
  return to > from ? { from, to } : { from, to: from + FLAT_SPAN_MS }
}

/** How many grid positions the track carries: two per pixel of a ~600px bar. */
const BRUSH_STEPS = 1200

/**
 * How far one arrow key moves a handle.
 *
 * A fraction of the span rather than a fixed duration, so a two-hour phishing
 * case and a three-month dwell time have the same grip. Floored at a minute,
 * which is the resolution an entry's own stamp is recorded at.
 */
export function brushStep(span: TimeWindow): number {
  return Math.max(FLAT_SPAN_MS, Math.round((span.to - span.from) / BRUSH_STEPS))
}

/**
 * The window two handle positions mean, with the ends snapped to the case.
 *
 * `max` is almost never on the step grid and a range control clamps down to
 * it, so the top position means *the end of the case* rather than one step
 * below it. Without the snap the end handle stops short of the last entry
 * however hard it is dragged, and the whole span can never be restored.
 *
 * `null` is the whole span: the caller can then tell a brush that found
 * nothing from a brush that is not on.
 */
export function brushWindow(span: TimeWindow, from: number, to: number): TimeWindow | null {
  const step = brushStep(span)
  const start = from - span.from < step ? span.from : from
  const end = span.to - to < step ? span.to : to
  return start <= span.from && end >= span.to ? null : { from: start, to: end }
}

/** Below this fraction of the track, a sweep was a click. */
const CLICK_SLOP = 0.01

/**
 * What a sweep across the track means: a window, or clearing the one there is.
 *
 * Takes fractions of the track rather than client coordinates, because jsdom
 * gives every element a zero box and the arithmetic is only assertable on this
 * side of that line. A sweep shorter than `CLICK_SLOP` is a click, and a click
 * clears.
 */
export function sweepWindow(span: TimeWindow, from: number, to: number): TimeWindow | null {
  if (Math.abs(to - from) < CLICK_SLOP) return null
  const at = (fraction: number) => span.from + fraction * (span.to - span.from)
  return brushWindow(span, at(Math.min(from, to)), at(Math.max(from, to)))
}

/** Whether a stamp is inside the window. `null` window is the whole case. */
export function withinWindow(at: number | null, window: TimeWindow | null): boolean {
  if (!window) return true
  // A row with no usable stamp is kept, never hidden: it has no position to be
  // outside the window with, and a row nobody can see is a row nobody can fix.
  if (at === null || !Number.isFinite(at)) return true
  return at >= window.from && at <= window.to
}

/**
 * How many stamps fall in each of `bins` equal slices of the span.
 *
 * The caller passes the bin count it has room for, because the histogram is
 * nearly binary at real resolution and a constant is only right at the width
 * it was tuned for.
 */
export function densityOf(
  times: readonly number[],
  span: TimeWindow,
  bins: number,
): number[] {
  const counts = new Array<number>(Math.max(1, Math.floor(bins) || 1)).fill(0)
  const width = span.to - span.from
  if (width <= 0) return counts
  for (const at of times) {
    if (!Number.isFinite(at) || at < span.from || at > span.to) continue
    const index = Math.min(
      counts.length - 1,
      Math.floor(((at - span.from) / width) * counts.length),
    )
    counts[index] = (counts[index] ?? 0) + 1
  }
  return counts
}

/**
 * Which of `bins` slices the window covers, one flag per slice.
 *
 * **Judged on the slice's midpoint**, inclusive at both ends: a slice whose
 * midpoint is exactly the window's edge is inside it. One comparison per
 * slice, and a tick on a boundary therefore lands on one side deterministically
 * rather than on whichever the rounding of two edges happened to give.
 *
 * A `null` window is the whole case, so every slice is covered.
 */
export function binsWithin(
  span: TimeWindow,
  bins: number,
  window: TimeWindow | null,
): boolean[] {
  const count = Math.max(1, Math.floor(bins) || 1)
  const slice = (span.to - span.from) / count
  return Array.from({ length: count }, (_, index) => {
    if (!window) return true
    const middle = span.from + (index + 0.5) * slice
    return middle >= window.from && middle <= window.to
  })
}

/**
 * A bin's height as a fraction of the tallest, square-rooted.
 *
 * Linear drops a bin holding one entry below a pixel against a busy
 * neighbour, which erases the lone row a density plot exists to show. The
 * cost is magnitude fidelity, which nobody reads off a track this size.
 */
export function tickHeight(count: number, tallest: number): number {
  if (count <= 0 || tallest <= 0) return 0
  return Math.sqrt(count) / Math.sqrt(tallest)
}

/**
 * The real hole around a window that caught nothing: the last stamp before it
 * and the first after. `null` at either end means the window runs off that
 * side of the case, where there is an edge rather than a gap.
 */
export function gapAround(
  times: readonly number[],
  window: TimeWindow,
): { before: number | null; after: number | null } {
  let before: number | null = null
  let after: number | null = null
  for (const at of times) {
    if (!Number.isFinite(at)) continue
    if (at < window.from && (before === null || at > before)) before = at
    if (at > window.to && (after === null || at < after)) after = at
  }
  return { before, after }
}

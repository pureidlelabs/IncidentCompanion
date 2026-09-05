/**
 * A window over a case's own span, and the histogram drawn behind it.
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
 */
export function tickHeight(count: number, tallest: number): number {
  if (count <= 0 || tallest <= 0) return 0
  return Math.sqrt(count) / Math.sqrt(tallest)
}

/**
 * The real hole around a window that caught nothing: the last stamp before it
 * and the first after.
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

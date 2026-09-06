/*
 * How wide the list pane runs, and what that resolves to at a given width.
 *
 * Beside the component because this is the one part of the layout a unit test
 * can hold: jsdom gives every element a zero box.
 */

export type SplitMeasure = 'narrow' | 'default' | 'wide'

/**
 * The list pane's measure, as the grid's first column.
 *
 * The index gives way rather than the two stacking: each measure caps its own
 * width and takes 40% below that, over a 9rem floor.
 */
export const COLUMNS: Record<SplitMeasure, string> = {
  narrow: 'grid-cols-[clamp(9rem,40%,16rem)_minmax(0,1fr)]',
  default: 'grid-cols-[clamp(9rem,40%,20rem)_minmax(0,1fr)]',
  wide: 'grid-cols-[clamp(9rem,40%,24rem)_minmax(0,1fr)]',
}

/**
 * The first track of a measure's template, read back out of the shipped class:
 * a Tailwind class must be a literal, so `COLUMNS` holds the numbers.
 */
export function listTrack(measure: SplitMeasure): string {
  return COLUMNS[measure].slice('grid-cols-['.length, -'_minmax(0,1fr)]'.length)
}

/**
 * What a track resolves to in px, for a grid container `width` px wide.
 *
 * **jsdom gives every element a zero box and no cascade**, so what the list
 * pane is actually given is invisible to the suite. This is the arithmetic
 * behind it, run over the shipped string, so the one thing a unit test can
 * hold is the thing that ships rather than a copy of it.
 *
 * Handles the two forms a track takes here - a fixed `<n>rem`, and the
 * `clamp(<min>rem,<share>%,<max>rem)` that gives way on a narrow container.
 * Rem is 16px, which is the root size the app sets and never overrides.
 */
export function resolveTrack(track: string, width: number): number {
  const clamped = /^clamp\((\d+(?:\.\d+)?)rem,(\d+)%,(\d+(?:\.\d+)?)rem\)$/.exec(track)
  if (clamped) {
    const [min, share, max] = [Number(clamped[1]) * 16, Number(clamped[2]), Number(clamped[3]) * 16]
    return Math.min(Math.max(min, (width * share) / 100), max)
  }

  const fixed = /^(\d+(?:\.\d+)?)rem$/.exec(track)
  if (fixed) return Number(fixed[1]) * 16

  throw new Error(`split: no arithmetic for the track "${track}"`)
}

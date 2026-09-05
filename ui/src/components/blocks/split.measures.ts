/*
 * How wide the list pane runs, and what that resolves to at a given width.
 *
 * Beside the component because this is the one part of the layout a unit test
 * can hold: jsdom gives every element a zero box.
 */

/** How wide the list pane runs. */
export type SplitMeasure = 'narrow' | 'default' | 'wide'

/**
 * The list pane's measure, as the grid's first column.
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

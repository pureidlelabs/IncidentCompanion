import { describe, expect, it } from 'vitest'

import {
  brushStep,
  brushWindow,
  densityOf,
  gapAround,
  spanOf,
  sweepWindow,
  binsWithin,
  tickHeight,
  withinWindow,
  type TimeWindow,
} from './time-window'

/**
 * The brush's arithmetic, attacked at the inputs a case actually produces:
 * nothing recorded, one entry, every entry in one instant, a handle dragged
 * past the end, and a sweep run right to left.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('the span a track is drawn over', () => {
  it('is null when nothing has a usable stamp', () => {
    expect(spanOf([])).toBeNull()
    expect(spanOf([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull()
  })

  it('widens a single entry to a minute, so there is something to grab', () => {
    expect(spanOf([1_000_000])).toEqual({ from: 1_000_000, to: 1_060_000 })
  })

  it('widens a case whose entries share one instant', () => {
    expect(spanOf([500, 500, 500])).toEqual({ from: 500, to: 60_500 })
  })

  it('reads first to last whatever order they arrive in', () => {
    expect(spanOf([3 * HOUR, HOUR, 2 * HOUR])).toEqual({ from: HOUR, to: 3 * HOUR })
  })

  it('ignores an unparseable stamp rather than collapsing the span', () => {
    expect(spanOf([Number.NaN, HOUR, 2 * HOUR])).toEqual({ from: HOUR, to: 2 * HOUR })
  })
})

describe('one step of the keyboard', () => {
  it('divides the span, so a short case and a long one grip the same', () => {
    expect(brushStep({ from: 0, to: 1200 * HOUR })).toBe(HOUR)
  })

  it('never goes below a minute, which is the stamp resolution', () => {
    expect(brushStep({ from: 0, to: 60_000 })).toBe(60_000)
    expect(brushStep({ from: 0, to: 1 })).toBe(60_000)
  })
})

describe('what two handle positions mean', () => {
  const span: TimeWindow = { from: 0, to: DAY }

  it('is null at the ends, so the whole span is not a filter', () => {
    expect(brushWindow(span, 0, DAY)).toBeNull()
  })

  /**
   * The defect the snap exists for: `max` is off the step grid, a range
   * control clamps down to the grid, and the end handle then stops short of
   * the last entry however hard it is dragged - which also makes the window
   * impossible to clear again.
   */
  it('snaps a handle within one step of an end onto that end', () => {
    const step = brushStep(span)
    expect(brushWindow(span, step - 1, DAY - step + 1)).toBeNull()
    expect(brushWindow(span, step + 1, DAY)).toEqual({ from: step + 1, to: DAY })
  })

  it('keeps a window that reaches neither end', () => {
    expect(brushWindow(span, 4 * HOUR, 6 * HOUR)).toEqual({ from: 4 * HOUR, to: 6 * HOUR })
  })

  it('is still null when a handle is dragged past an end', () => {
    expect(brushWindow(span, -DAY, 2 * DAY)).toBeNull()
  })
})

describe('a sweep across the track', () => {
  const span: TimeWindow = { from: 0, to: DAY }

  it('reads a click as clearing the window', () => {
    expect(sweepWindow(span, 0.5, 0.5)).toBeNull()
    expect(sweepWindow(span, 0.5, 0.504)).toBeNull()
  })

  it('reads right to left the same as left to right', () => {
    expect(sweepWindow(span, 0.75, 0.25)).toEqual(sweepWindow(span, 0.25, 0.75))
  })

  it('places the window where the sweep was', () => {
    expect(sweepWindow(span, 0.25, 0.5)).toEqual({ from: DAY / 4, to: DAY / 2 })
  })

  it('reads a sweep across the whole track as no window', () => {
    expect(sweepWindow(span, 0, 1)).toBeNull()
  })
})

describe('what the window keeps', () => {
  const window: TimeWindow = { from: 10, to: 20 }

  it('keeps everything when there is no window', () => {
    expect(withinWindow(5, null)).toBe(true)
  })

  it('is inclusive at both ends', () => {
    expect(withinWindow(10, window)).toBe(true)
    expect(withinWindow(20, window)).toBe(true)
  })

  it('drops what is outside', () => {
    expect(withinWindow(9, window)).toBe(false)
    expect(withinWindow(21, window)).toBe(false)
  })

  it('keeps a row with no usable stamp rather than hiding it', () => {
    expect(withinWindow(null, window)).toBe(true)
    expect(withinWindow(Number.NaN, window)).toBe(true)
  })
})

describe('the histogram behind the track', () => {
  const span: TimeWindow = { from: 0, to: 100 }

  it('counts into equal slices', () => {
    expect(densityOf([0, 1, 50, 99], span, 2)).toEqual([2, 2])
  })

  it('puts the last stamp in the last bin rather than one past the end', () => {
    expect(densityOf([100], span, 4)).toEqual([0, 0, 0, 1])
  })

  it('drops a stamp outside the span', () => {
    expect(densityOf([-1, 101, Number.NaN], span, 2)).toEqual([0, 0])
  })

  it('answers one bin when asked for none', () => {
    expect(densityOf([1, 2], span, 0)).toEqual([2])
    expect(densityOf([1, 2], span, -5)).toEqual([2])
  })

  it('answers zeroes rather than dividing by a zero-width span', () => {
    expect(densityOf([5], { from: 5, to: 5 }, 3)).toEqual([0, 0, 0])
  })
})

describe('which slices the window covers', () => {
  const span: TimeWindow = { from: 0, to: 100 }

  it('covers everything when there is no window', () => {
    expect(binsWithin(span, 4, null)).toEqual([true, true, true, true])
  })

  it('covers the slices whose middle is inside', () => {
    // Middles at 12.5, 37.5, 62.5, 87.5.
    expect(binsWithin(span, 4, { from: 30, to: 70 })).toEqual([false, true, true, false])
  })

  /**
   * The boundary case the docstring commits to: a middle exactly on an edge is
   * inside. Without a stated side, a tick on the edge flickers with the
   * arithmetic of two independently rounded ends.
   */
  it('counts a slice whose middle is exactly on an edge as covered', () => {
    expect(binsWithin(span, 4, { from: 12.5, to: 37.5 })).toEqual([true, true, false, false])
  })

  it('covers nothing when the window falls between two middles', () => {
    expect(binsWithin(span, 4, { from: 20, to: 30 })).toEqual([false, false, false, false])
  })

  it('answers one slice when asked for none', () => {
    expect(binsWithin(span, 0, null)).toEqual([true])
  })
})

describe('how tall a bin is drawn', () => {
  it('is the full track at the tallest bin', () => {
    expect(tickHeight(9, 9)).toBe(1)
  })

  /**
   * Linear would put this at 1/9 of the track - under a pixel on an 18px bar,
   * so the lone entry a density plot exists to show is not drawn at all.
   */
  it('lifts a lone entry clear of a busy neighbour', () => {
    expect(tickHeight(1, 9)).toBeCloseTo(1 / 3)
  })

  it('draws nothing for an empty bin, or against an empty case', () => {
    expect(tickHeight(0, 9)).toBe(0)
    expect(tickHeight(3, 0)).toBe(0)
  })
})

describe('the hole around a window that caught nothing', () => {
  it('names the stamps either side of it', () => {
    expect(gapAround([0, 10, 90, 100], { from: 20, to: 80 })).toEqual({ before: 10, after: 90 })
  })

  it('says null where the window runs off the end of the case', () => {
    expect(gapAround([50], { from: 0, to: 10 })).toEqual({ before: null, after: 50 })
    expect(gapAround([50], { from: 90, to: 100 })).toEqual({ before: 50, after: null })
  })
})

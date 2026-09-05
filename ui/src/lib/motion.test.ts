import type { Variants } from 'motion/react'
import { describe, expect, it } from 'vitest'

import { anchored, spring, transition } from './motion'

/** A variant read as a plain object, which is what every variant in this file is. */
function state(variants: Variants, name: 'hidden' | 'shown' | 'gone'): Record<string, unknown> {
  return variants[name] as Record<string, unknown>
}

/** The `transition` a variant names, which every one of ours does. */
function speedOf(variants: Variants, name: 'shown' | 'gone'): { duration: number } {
  return state(variants, name).transition as { duration: number }
}

/**
 * `anchored` is the one part of the motion vocabulary a test can see.
 *
 * **What this file cannot cover, and no test in this repository can.** Whether
 * a popover *looks* like it came from its trigger, whether 180ms is the right
 * duration, whether the scale reads as arriving rather than as zooming - all of
 * it is a rendered judgement, and jsdom gives every element a zero box. The
 * assertions below are about the *shape* of the variants: which axis carries
 * the travel, which way it points, and that nothing is left set when the
 * surface is shown. Those are the failures that produce a surface stuck 8px off
 * its anchor, which is a defect rather than a taste.
 *
 * The showcase story `motion.stories.tsx` is where the rendered half is
 * judged, by a person.
 */
describe('anchored', () => {
  /**
   * The travel points *away* from the trigger, so the surface moves back
   * towards it as it arrives.
   *
   * A surface placed above its trigger starts below where it lands (positive
   * y); one placed below starts above it (negative y). Getting this backwards
   * still animates, and reads as the surface being flung away from the thing
   * that opened it.
   */
  it.each([
    ['top', 'y', 1],
    ['bottom', 'y', -1],
    ['left', 'x', 1],
    ['right', 'x', -1],
  ] as const)('travels on %s away from the trigger', (placement, axis, sign) => {
    const { variants } = anchored(placement)
    const hidden = state(variants, 'hidden')

    expect(hidden[axis]).toBeDefined()
    expect(hidden[axis === 'x' ? 'y' : 'x']).toBeUndefined()
    // A negative offset is spelled `calc(<d> * -1)`; a positive one is the
    // bare distance. Nothing else in the file writes a signed length.
    expect(String(hidden[axis]).includes('* -1')).toBe(sign === -1)
  })

  /** A cross-axis placement is decided by its side, not by the alignment after it. */
  it('reads the side and ignores the alignment suffix', () => {
    expect(anchored('top start')).toEqual(anchored('top'))
    expect(anchored('bottom end')).toEqual(anchored('bottom'))
  })

  /**
   * **`shown` zeroes both axes, not just the one that moved.**
   *
   * React Aria re-places a surface when it would overflow the viewport, so one
   * instance can be built with `x` set and re-rendered with `y` set. Zeroing
   * only the axis this placement uses leaves the other one at its `hidden`
   * value, and the surface sits permanently displaced along it.
   */
  it.each(['top', 'bottom', 'left', 'right'])('zeroes both axes when shown (%s)', (placement) => {
    const shown = state(anchored(placement).variants, 'shown')
    expect(shown.x).toBe(0)
    expect(shown.y).toBe(0)
  })

  /**
   * The origin is the edge the surface is anchored to, which is the opposite
   * edge from the one it travels from. Scaling from the centre instead reads as
   * a zoom rather than as the trigger producing the surface.
   */
  it.each([
    ['top', 'bottom center'],
    ['bottom', 'top center'],
    ['left', 'right center'],
    ['right', 'left center'],
  ])('anchors the transform origin to the %s edge', (placement, origin) => {
    expect(anchored(placement).origin).toBe(origin)
  })

  /**
   * Every state names its own transition. A variant without one falls back to
   * Motion's default spring, which is nothing this app chose - and it is
   * invisible, because the surface still animates.
   */
  it('gives shown and gone an explicit transition', () => {
    const { variants } = anchored('top')
    expect(state(variants, 'shown').transition).toBeDefined()
    expect(state(variants, 'gone').transition).toBeDefined()
  })

  /** Exit is faster than entry: the surface has already been read. */
  it('leaves faster than it arrives', () => {
    const { variants } = anchored('top', { speed: 'base' })
    expect(speedOf(variants, 'gone').duration).toBeLessThan(speedOf(variants, 'shown').duration)
  })

  /** `speed` selects from the shared scale rather than taking a number. */
  it('takes its entry duration from the named scale', () => {
    const { variants } = anchored('top', { speed: 'fast' })
    expect(state(variants, 'shown').transition).toEqual(transition.fast)
  })
})

describe('spring', () => {
  /**
   * **Every spring the app uses is in this record.** The one that was not -
   * the progress bar's fill - meant "what springs does this app have" had a
   * wrong answer, and the next component wanting a fill had nothing to copy.
   *
   * This asserts the collection is well-formed, not that the numbers are right:
   * whether 220 stiffness feels like progress is a rendered judgement.
   */
  it('declares stiffness, damping and mass on every entry', () => {
    for (const [name, value] of Object.entries(spring)) {
      expect(value, name).toMatchObject({
        type: 'spring',
        stiffness: expect.any(Number),
        damping: expect.any(Number),
        mass: expect.any(Number),
      })
    }
  })
})

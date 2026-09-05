import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Variants } from 'motion/react'
import { describe, expect, it } from 'vitest'

import { anchored, DURATION, EASE_OUT, spring, transition } from './motion'

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

describe('the motion this file declares and the motion the stylesheet declares', () => {
  /**
   * **Two motion systems run here, and they overlap on two values.**
   * `motion/react` drives entries, exits and springs from JavaScript; CSS
   * transitions drive the rest, through `duration-(--duration-fast)` and
   * `ease-out`. Distances are not duplicated -- `--motion-rise` and
   * `--motion-travel` are read through `var()`, which is what motion.dev's own
   * Tailwind guidance asks for -- but a `Transition` takes seconds as a number,
   * so the durations and the easing curve are written on both sides.
   *
   * `motion.ts` says as much in its own docstring, and nothing held the two
   * halves together. That is how the paper palette came to disagree with the
   * document it exists to predict, in six of seven values. This is that check,
   * for motion.
   */
  const scale = readFileSync(join(process.cwd(), 'src', 'styles', 'scale.css'), 'utf8')
    // A comment naming a duration is not a declaration of one.
    .replace(/\/\*[\s\S]*?\*\//g, '')

  const declared = (name: string) => {
    const found = new RegExp(`--${name}:\\s*([^;]+);`).exec(scale)
    if (!found) throw new Error(`scale.css declares no --${name}`)
    return found[1]!.trim()
  }

  it('states each duration in seconds that the stylesheet states in milliseconds', () => {
    for (const [name, seconds] of Object.entries(DURATION)) {
      const css = declared(`duration-${name}`)
      expect(css.endsWith('ms'), `--duration-${name} is ${css}`).toBe(true)
      expect(Number.parseFloat(css) / 1000, `--duration-${name}`).toBeCloseTo(seconds, 5)
    }
  })

  it('states the same easing curve as the stylesheet', () => {
    const css = declared('ease-out')
    const points = [...css.matchAll(/-?\d*\.?\d+/g)].map((m) => Number.parseFloat(m[0]))
    expect(points, `--ease-out is ${css}`).toEqual([...EASE_OUT])
  })

  it('covers every duration the stylesheet declares, so neither side grows alone', () => {
    const inCss = [...scale.matchAll(/--duration-([a-z]+):/g)].map((m) => m[1]!).sort()
    expect(inCss.length).toBeGreaterThan(0)
    expect(Object.keys(DURATION).sort()).toEqual(inCss)
  })
})

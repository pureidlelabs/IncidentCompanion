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
 */
describe('anchored', () => {
  /**
   * The travel points *away* from the trigger, so the surface moves back
   * towards it as it arrives.
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
   */
  it.each(['top', 'bottom', 'left', 'right'])('zeroes both axes when shown (%s)', (placement) => {
    const shown = state(anchored(placement).variants, 'shown')
    expect(shown.x).toBe(0)
    expect(shown.y).toBe(0)
  })

  /**
   * The origin is the edge the surface is anchored to, which is the opposite
   * edge from the one it travels from.
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
   * Every state names its own transition.
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
   * **Every spring the app uses is in this record.**
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

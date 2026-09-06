/**
 * **The ink on a shaded cell is computed, and the numbers are why.**
 *
 * These assertions are written against measured ratios rather than against
 * "returns the dark one", because the claim being defended is a contrast floor
 * - a implementation that returned ink unconditionally would satisfy every
 * ramp case here and be wrong the moment a dark fill arrives.
 */
import { describe, expect, it } from 'vitest'

import {
  contrastRatio,
  HIGH,
  INK,
  inkOn,
  LOW,
  MEDIUM,
  PAPER,
  RESPONSE,
  TABLE_HEADER,
  TABLE_HEADER_INK,
  ZEBRA,
} from './palette.js'

describe('the ink that reads on a fill', () => {
  it.each([
    ['the yellow', LOW, 1.92],
    ['the orange', MEDIUM, 2.8],
    ['the red', HIGH, 3.76],
  ])('has white failing on %s', (_name, fill, measured) => {
    expect(contrastRatio(PAPER, fill)).toBeCloseTo(measured, 1)
    expect(contrastRatio(PAPER, fill)).toBeLessThan(4.5)
    expect(inkOn(fill)).toBe(INK)
  })

  /**
   * **The other direction, which is what makes this a computation.** The
   * response colour is dark enough that ink fails on it and white does not -
   * so a helper hard-coded to ink would put 2.7:1 text on every action.
   */
  it('answers white on a ground too dark for ink', () => {
    expect(contrastRatio(INK, RESPONSE)).toBeLessThan(4.5)
    expect(inkOn(RESPONSE)).toBe(PAPER)
  })

  it('is order-independent, as the ratio is defined', () => {
    expect(contrastRatio(PAPER, HIGH)).toBeCloseTo(contrastRatio(HIGH, PAPER), 6)
  })

  it('answers 21 for the extremes and 1 for a colour against itself', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 4)
    expect(contrastRatio(MEDIUM, MEDIUM)).toBeCloseTo(1, 6)
  })
})

/**
 * **A header row nobody can find is the defect this pair defends against.** A
 * header too close to the stripe under it leaves the first data row reading as
 * the titles, and a painter holding only one of the two hexes is self-consistent
 * while it happens -- which is why both live in one module and are asserted as a
 * pair.
 *
 * **3:1 is the floor, and it is the floor for a non-text boundary** -- what has
 * to be perceivable here is the edge between two grounds, not a glyph. The ink's
 * own 4.5:1 against its header is the separate claim below.
 */
describe('the table header', () => {
  it('is findable against the zebra stripe it sits above', () => {
    expect(contrastRatio(TABLE_HEADER, ZEBRA)).toBeGreaterThanOrEqual(3)
  })

  it('carries ink that reads on it, and survives a photocopy', () => {
    expect(contrastRatio(TABLE_HEADER_INK, TABLE_HEADER)).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * **The paper case, which the zebra one does not cover.** An unstriped table
   * puts the header against `PAPER` instead, and a ground chosen only against
   * `ZEBRA` could pass that test while vanishing on a two-row table.
   */
  it('is findable against plain paper too', () => {
    expect(contrastRatio(TABLE_HEADER, PAPER)).toBeGreaterThanOrEqual(3)
  })
})

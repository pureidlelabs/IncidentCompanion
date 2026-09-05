/**
 * **The ink on a shaded cell is computed, and the numbers are why.**
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
  /**
   * The three measurements that decided this, from the Python tier that drew
   * these blocks first. White was the shipped choice and failed at every rung.
   */
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
   * **The other direction, which is what makes this a computation.**
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
 * **A header row nobody can find is the defect this pair defends against.**
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

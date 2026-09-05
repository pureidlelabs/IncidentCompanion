/**
 * Written from an attack: the inputs `String()` turns into rubbish silently.
 */
import { describe, expect, it } from 'vitest'

import { textOf } from './text-of.js'

describe('coercing an unknown to text', () => {
  it('passes a string through', () => {
    expect(textOf('DEMO-2026-031')).toBe('DEMO-2026-031')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('answers empty for %s', (_name, value) => {
    expect(textOf(value)).toBe('')
  })

  it('answers empty for an object rather than [object Object]', () => {
    // This is the one that shipped: an archive filename is built from the
    // case reference, and a reference arriving as an object named the file
    // after Object's default stringification.
    expect(textOf({ reference: 'x' })).toBe('')
    expect(textOf([1, 2])).toBe('')
  })

  /**
   * **A number is not text, and coercing one is how a lookup silently misses.**
   */
  it('answers empty for a number or a boolean', () => {
    expect(textOf(7)).toBe('')
    expect(textOf(false)).toBe('')
  })
})

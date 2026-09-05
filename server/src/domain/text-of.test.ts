/**
 * Written from an attack: the inputs `String()` turns into rubbish silently.
 *
 * Each case below reached a filename, a kill-chain lookup or a channel name in
 * the shipping code, and `String()` answered something plausible-looking for
 * every one of them.
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
   * `ukcPhase` matches a technique id against a table of strings; a numeric
   * `1` becoming `'1'` looks like a value rather than like the absence it is.
   */
  it('answers empty for a number or a boolean', () => {
    expect(textOf(7)).toBe('')
    expect(textOf(false)).toBe('')
  })
})

/**
 * The one piece of report vocabulary that is not a string in a pack.
 *
 * **The fourteen tests that were here went with the registry they covered.**
 * They asserted a pack lookup, its fallback, the language list and its
 * coverage against `PACKS`, a compiled-in literal -- and packs are rows now, so
 * the same assertions would have pinned the report to the two languages that
 * ship. Each property moved rather than being dropped: lookup and fallback,
 * coverage, and the order the list is offered in are all `packs.test.ts`, which
 * checks them against any pack rather than against the two in the build.
 */
import { describe, expect, it } from 'vitest'

import { formatTimestamp } from './labels.js'
import { NL } from './labels.nl.js'
import { unknownKeysIn } from './packs.js'

describe('printing a timestamp', () => {
  it('answers empty for a value that is not there', () => {
    // A report prints "Not recorded" through a *key*; a blank cell here would
    // be a heading with nothing under it and no way to tell which.
    expect(formatTimestamp(null)).toBe('')
    expect(formatTimestamp(undefined)).toBe('')
    expect(formatTimestamp('')).toBe('')
  })

  it('carries the zone by default, because a bare clock time is ambiguous', () => {
    // The default is the safe one: a fact standing on its own has no column
    // heading to say which zone it is in.
    expect(formatTimestamp('2026-03-04T05:06:07Z')).toBe('2026-03-04 05:06 UTC')
  })

  it('drops the zone only when asked, for a column whose heading says it', () => {
    // Four characters per cell wrapped every timeline timestamp over two lines,
    // which is why this option exists at all.
    expect(formatTimestamp('2026-03-04T05:06:07Z', { zone: false })).toBe('2026-03-04 05:06')
  })

  it('answers empty for a date that is not one', () => {
    // `new Date('nonsense')` is an Invalid Date rather than a throw, so without
    // the guard this prints "NaN-NaN-NaN NaN:NaN" into a customer's report.
    expect(formatTimestamp('not a date')).toBe('')
  })
})

describe('the pack this app ships in Dutch', () => {
  /**
   * **A key English does not carry is dropped in silence.** `unknownKeysIn`
   * is what the upload route uses to refuse one, and the pack compiled into
   * this app never goes through that route -- so a typo here costs a label
   * that never prints and a coverage figure that agrees with the damage,
   * with nothing red.
   *
   * The seam is two lists written in two files; this is the only thing that
   * compares them.
   */
  it('carries no key the English pack does not', () => {
    expect(unknownKeysIn(NL)).toEqual([])
  })
})

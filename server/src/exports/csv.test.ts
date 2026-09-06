/**
 * The CSV writer, attacked at the two things a CSV gets wrong: formula
 * injection, and quoting a field holding a comma, a quote or a newline.
 *
 * Both fail by producing a file that opens and is wrong rather than one that
 * errors, so neither has a symptom a round trip would show.
 */
import { describe, expect, it } from 'vitest'

import { neutralise, toCsv } from './csv.js'

describe('escaping a cell against a spreadsheet formula', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['=cmd|/c calc', "'=cmd|/c calc"],
  ])('prefixes %s', (given, expected) => {
    expect(neutralise(given)).toBe(expected)
  })

  /**
   * **Leading whitespace is the bypass.** A spreadsheet trims before deciding
   * whether a cell is a formula, so a check on the raw first character misses
   * ` =1+1` - and a tab or a NUL is the same trick with a character nobody
   * sees in a diff.
   */
  it.each([[' =1+1'], ['\t=1+1'], ['\r\n=1+1'], ['\u0000=1+1']])(
    'prefixes %j, which a spreadsheet trims before evaluating',
    (given) => {
      expect(neutralise(given).startsWith("'")).toBe(true)
    },
  )

  /**
   * **An already-quoted formula is still a formula.** Prefixing once and
   * stopping lets `'=1+1` through, which some spreadsheets strip back to
   * `=1+1` on import.
   */
  it('prefixes a value that already carries a quote in front of a formula', () => {
    expect(neutralise("'=1+1")).toBe("''=1+1")
  })

  it.each([['ordinary text'], ['192.168.0.1'], ['WKS-01'], ['a=b']])(
    'leaves %s alone',
    (given) => {
      expect(neutralise(given)).toBe(given)
    },
  )

  /** Numbers and booleans are not text and cannot be formulas. */
  it('passes a non-string through untouched', () => {
    expect(neutralise(42)).toBe(42)
    expect(neutralise(true)).toBe(true)
    expect(neutralise(null)).toBe(null)
  })
})

describe('writing rows', () => {
  it('writes a header from the columns given, in that order', async () => {
    const csv = await toCsv([{ b: '2', a: '1' }], ['a', 'b'])
    expect(csv.split('\n')[0]).toBe('a,b')
    expect(csv.split('\n')[1]).toBe('1,2')
  })

  /**
   * **The three characters a hand-rolled writer gets wrong.** Each of these
   * produces a file that opens and is silently wrong, never one that errors.
   */
  it('quotes a field holding a comma, a quote or a newline', async () => {
    const csv = await toCsv([{ note: 'a,b' }, { note: 'say "hi"' }, { note: 'one\ntwo' }], ['note'])
    expect(csv).toContain('"a,b"')
    expect(csv).toContain('"say ""hi"""')
    expect(csv).toContain('"one\ntwo"')
  })

  it('writes an empty cell for a missing or null value', async () => {
    const csv = await toCsv([{ a: null, b: undefined }], ['a', 'b'])
    expect(csv.split('\n')[1]).toBe(',')
  })

  it('joins a list with the separator the reader splits on', async () => {
    const csv = await toCsv([{ refs: ['s-1', 's-2'] }], ['refs'])
    expect(csv).toContain('s-1;s-2')
    expect(csv).not.toContain('s-1, s-2')
  })

  it('writes an ISO timestamp for a Date, so it sorts as text', async () => {
    const when = new Date('2026-03-04T05:06:07.000Z')
    const csv = await toCsv([{ at: when }], ['at'])
    expect(csv).toContain('2026-03-04T05:06:07.000Z')
  })

  /** The escaping is not optional and not the caller's to remember. */
  it('neutralises a formula on the way out, without being asked', async () => {
    const csv = await toCsv([{ hostname: '=cmd|/c calc' }], ['hostname'])
    expect(csv).toContain("'=cmd|/c calc")
  })

  it('writes a header and no rows for an empty collection', async () => {
    const csv = await toCsv([], ['a', 'b'])
    expect(csv.trim()).toBe('a,b')
  })
})

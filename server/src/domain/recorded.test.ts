/**
 * That a recorded query keeps its layout, and everything that is not layout is
 * taken out of it.
 *
 * **The attack this file is written from.** `pasted()` is the app's sanitiser
 * for a value an analyst copied out of a console, and its character set is
 * `U+0000-U+001F` among others - which is where newline, tab and carriage
 * return live. A five-line KQL query put through it comes back as one line,
 * silently, and the analyst's own record of what they ran is destroyed by the
 * guard meant to protect it. Nothing goes red: the field is populated, the
 * value is a string, and only a reader who knows what the query looked like
 * can tell.
 *
 * Each assertion below fixes one half of that: what an analyst typed survives,
 * and what they cannot see does not.
 */
import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import { withoutInvisibles } from './invisible.lists.js'
import { recorded, withoutInvisiblesKeepingLayout } from './recorded.js'

const ESC = ''
const NUL = '\u0000'
const RLO = '\u202e'
const ZWSP = '\u200b'

describe('a recorded query keeps its layout', () => {
  const query = [
    'CommonSecurityLog',
    '| where TimeGenerated between (datetime(2026-08-13T16:00:00Z) .. datetime(2026-08-13T18:00:00Z))',
    '| where RequestURL has "mega-sync-store.example"',
  ].join('\n')

  it('keeps every newline, where the single-line sanitiser eats them', () => {
    expect(withoutInvisiblesKeepingLayout(query)).toBe(query)
    // The trap this module exists for, asserted rather than described.
    expect(withoutInvisibles(query)).not.toContain('\n')
  })

  it('keeps a tab, which is indentation in a piped query', () => {
    expect(withoutInvisiblesKeepingLayout('a\n\tb')).toBe('a\n\tb')
  })

  /** A transcript pasted out of a terminal arrives full of these. */
  it('strips an ANSI colour sequence, whose ESC is not layout', () => {
    expect(withoutInvisiblesKeepingLayout(`${ESC}[31mFAILED${ESC}[0m`)).toBe('[31mFAILED[0m')
  })

  it('strips a bidi override, which reorders what a reviewer reads', () => {
    expect(withoutInvisiblesKeepingLayout(`invoice${RLO}gpj.exe`)).toBe('invoicegpj.exe')
  })

  it('strips a NUL and a zero-width space in the middle of a line', () => {
    expect(withoutInvisiblesKeepingLayout(`ab${NUL} c${ZWSP}d`)).toBe('ab cd')
  })

  /**
   * **A carriage return goes, and the newline beside it stays.** Otherwise one
   * file ending is stored as two and every diff of the query is noise.
   */
  it('drops a carriage return and keeps the newline it came with', () => {
    expect(withoutInvisiblesKeepingLayout('a\r\nb')).toBe('a\nb')
  })

  it('is a no-op on a value that carries nothing invisible', () => {
    expect(withoutInvisiblesKeepingLayout('| summarize count() by SourceIP')).toBe(
      '| summarize count() by SourceIP',
    )
  })
})

describe('the recorded() schema wrapper', () => {
  it('cleans before the ceiling is applied, so a padded value is not refused', () => {
    const schema = recorded(z.string().max(200))
    const padded = 'a'.repeat(200) + ZWSP.repeat(50)

    expect(schema.parse(padded)).toBe('a'.repeat(200))
  })

  it('leaves a non-string alone so a default underneath still fires', () => {
    expect(recorded(z.string().default('')).parse(undefined)).toBe('')
  })

  it('keeps the ceiling that the wrapped schema declares', () => {
    const schema = recorded(z.string().max(4))

    expect(schema.safeParse('abcde').success).toBe(false)
  })

  /**
   * The whole reason this wrapper is not `pasted()`: a query is the one field
   * in the app whose newlines are content.
   */
  it('stores a multi-line query as the analyst wrote it', () => {
    const schema = recorded(z.string().max(500))

    expect(schema.parse('one\ntwo\nthree')).toBe('one\ntwo\nthree')
  })
})

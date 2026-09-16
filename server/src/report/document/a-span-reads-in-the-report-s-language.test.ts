/**
 * **A span in a report reads in the language the report is written in.**
 *
 * **Driven by the language code and not by a pack**, which is the claim: a
 * duration is a format rather than a translation, so it follows `language` even
 * where the translator is the English one. The shipped Dutch pack carries no
 * unit and is the case that was reported. -> #645
 *
 * **Two formatters print spans and both take the language.** -> #698
 *
 * **What this does not cover:** how a span is worded, which is ICU's; the
 * client's own `durationText`, which is chrome rather than a document and
 * measures a different span under the same word.
 */
import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { duration, metrics } from './derived.js'
import { NL } from './labels.nl.js'
import { narrative } from './narrative.js'
import type { Node, TableNode } from './model.js'
import { english, translatorFor } from './packs.js'
import type { ReportInput } from './resolve.js'

/**
 * Hours and days are the discriminating units: Dutch and English both abbreviate
 * a minute `min`, so a case asserting on that one would pass in either language.
 */
const CLOCKS = {
  // Four hours before containment, so the dwell row is hours.
  timeline: [{ time: '2026-01-01T08:00:00Z', description: 'eerste baken' }],
  openedAt: '2026-01-01T10:00:00Z',
  detectedAt: '2026-01-01T10:30:00Z',
  containedAt: '2026-01-01T12:00:00Z',
  status: 'closed',
  closedAt: '2026-01-01T12:30:00Z',
}

function input(language: string, t = english()): ReportInput {
  return {
    title: 'Onder test',
    tlp: '',
    language,
    t,
    languageCoverage: 1,
    blocks: [],
    caseData: { id: 'c-1', title: 'Onder test', ...CLOCKS },
  }
}

const table = (nodes: Node[]): TableNode =>
  nodes.find((one): one is TableNode => one.type === 'table')!

/** Every value cell in the metrics table, as text. */
function values(nodes: Node[]): string[] {
  return table(nodes).rows.map((row) => {
    const cell = row[1]
    return typeof cell === 'string' ? cell : (cell?.text ?? '')
  })
}

/** Beats reaching all three span paths the narrative prints. */
const BEATS = {
  timeline: [
    { time: '2026-01-01T08:00:00Z', description: 'eerste baken' },
    // 45 minutes, and a different thing said: a new run, under the long gap.
    { time: '2026-01-01T08:45:00Z', description: 'tweede baken' },
    // An hour and a quarter later, so this gap takes a band rather than a plus.
    // The same thing twice, half an hour apart: one run that covers a span.
    { time: '2026-01-01T10:00:00Z', description: 'derde baken' },
    { time: '2026-01-01T10:30:00Z', description: 'derde baken' },
    // Five days later, which is the band.
    { time: '2026-01-06T10:00:00Z', description: 'vierde baken' },
  ],
  openedAt: '2026-01-01T07:00:00Z',
  status: 'open',
}

function withBeats(language: string): ReportInput {
  return { ...input(language), caseData: { id: 'c-1', title: 'Onder test', ...BEATS } }
}

describe('a gap between two beats in the narrative', () => {
  it('reads in the language the report is written in', () => {
    const printed = JSON.stringify(narrative(withBeats('nl')))

    expect(printed, 'a gap printed an English unit in a Dutch document').not.toMatch(
      /\d\s?(hr|hrs|h|d|days?)\b/,
    )
    expect(printed, 'no gap reached the narrative at all, so this asserts nothing').toMatch(
      /uur|dagen/,
    )
  })

  it('reads in English when that is the language', () => {
    const printed = JSON.stringify(narrative(withBeats('en')))

    expect(printed).toMatch(/\bhr\b|\bdays?\b/)
  })

  /** Two durations on one line: the `+` is what tells them apart. -> `narrative.ts` */
  it('marks the gap with a plus and the span it covers without one', () => {
    const printed = JSON.stringify(narrative(withBeats('nl')))

    expect(printed, 'no gap was marked as one').toMatch(/\+[^"]*(uur|min|dagen)/)
    // Counted: these beats print three spans and exactly the first owes a plus.
    expect(
      (printed.match(/\+/g) ?? []).length,
      'a plus reached a span that is not a gap, or the gap lost its own',
    ).toBe(1)
  })
})

describe('a span printed in a report', () => {
  /**
   * The reported defect: the shipped Dutch pack carries no unit, so every span
   * in a Dutch report printed an English one.
   */
  it('prints Dutch units under the shipped Dutch pack, which carries none', () => {
    const dutch = translatorFor({ code: 'nl', label: 'Nederlands', strings: NL })
    const printed = values(metrics(input('nl', dutch))).join(' | ')

    expect(printed, 'a span printed an English unit in a Dutch document').not.toMatch(
      /\d\s?(hr|hrs|h|d|days?)\b/,
    )
    expect(printed, 'no span reached the table at all, so this asserts nothing').toMatch(/uur/)
  })

  /**
   * **A span follows the language, not the pack.** Asserted with the English
   * translator on a Dutch report, which is the state an install without a Dutch
   * pack is in -- and the whole difference between a format and a translation.
   */
  it('prints Dutch units with no Dutch pack at all', () => {
    const printed = values(metrics(input('nl'))).join(' | ')

    expect(printed).toMatch(/uur/)
  })

  it('prints English units in an English report', () => {
    const printed = values(metrics(input('en'))).join(' | ')

    expect(printed).toMatch(/\bhr\b/)
  })

  /**
   * **A language code is whatever an install uploaded, and it fails two ways.**
   * `aaa-aaaaaaaa-aaaaaaaa` is well formed to `LANGUAGE_TAG` and a `RangeError`
   * to ICU, so unguarded it is a report that renders not at all; `zz` is a tag
   * ICU takes and holds no unit data for, which throws nothing and would pass a
   * case asserting only that a number reached the cell. `''` is a report that
   * has not chosen. All three owe English units rather than a failure.
   */
  it.each([['aaa-aaaaaaaa-aaaaaaaa'], [''], ['zz']])(
    'falls back to English units on the code %j',
    (language) => {
      expect(values(metrics(input(language))).join(' | ')).toMatch(/\bhr\b/)
    },
  )

  /**
   * **The English above is not evidence the code was noticed**, because ICU
   * resolves an unknown tag to English on its own -- so the case above passes
   * whether or not anything checked. The log is the only observable difference,
   * and the count is the second half: a document prints many spans, and one
   * warning per row is a line nobody reads.
   *
   * `qq` is used by no other case here, which is what keeps the count honest --
   * the codes already reported are held for the life of the module.
   */
  it('says once, not per span, that a language ICU cannot print in reads English', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    try {
      values(metrics(input('qq')))
      values(metrics(input('qq')))

      const mine = warn.mock.calls.filter((call) => String(call[0]).includes('`qq`'))
      expect(mine, 'a code ICU holds no unit data for went unreported').toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  /** A language ICU can print in is not a complaint. */
  it('says nothing about a language ICU has unit data for', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    try {
      values(metrics(input('nl')))

      expect(warn.mock.calls.filter((call) => String(call[0]).includes('`nl`'))).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })

  /**
   * **Every shape, because the table above reaches one of them.** A metrics row
   * is hours on any case an analyst would open, so the minutes, days and
   * under-a-minute shapes would otherwise be rendered by nothing.
   */
  it.each([
    [30 * 60_000, '30 min'],
    [150 * 60_000, '2 uur, 30 min'],
    // Zero parts are dropped: "2 uur, 0 min" is noise on a figure a regulator reads.
    [120 * 60_000, '2 uur'],
    [50 * 3_600_000, '2 dagen, 2 uur'],
    // **Never "0 minuten".** A span under a minute is real, and rounding it to
    // zero reads as nothing having elapsed.
    [30_000, '< 1 min'],
  ])('prints every shape of span in the report language', (ms, expected) => {
    expect(duration(ms, 'nl')).toBe(expected)
  })
})

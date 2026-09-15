/**
 * **A span in a report reads in the language the report is written in.**
 *
 * The labels around the metric rows come from the pack; the units did not.
 * `duration` returned `min`, `h` and `d` whatever the document's language was,
 * so a report read a translated label and an English value on one line.
 * -> #645
 *
 * **Driven by a pack written here rather than by the shipped Dutch one.** What
 * this asserts is that the units come from wherever the words come from, and a
 * pack of real Dutch would tie the case to whichever keys somebody has got
 * round to carrying across -- `labels.nl.ts` is partial by design.
 *
 * **Two formatters printed spans and only one took the translator.** The
 * narrative block measured its own gaps between beats and printed `+45m`,
 * `+3h`, `+5d` in every language, under an exemption written when no span in a
 * report could be translated at all. -> #698
 *
 * **What this does not cover:** how a span is worded, which is the pack's;
 * whether the shipped Dutch pack carries these keys, which it does not; and the
 * client's own `durationText`, which is chrome rather than a document and
 * measures a different span under the same word.
 */
import { describe, expect, it } from 'vitest'

import { duration, metrics } from './derived.js'
import { narrative } from './narrative.js'
import type { Node, TableNode } from './model.js'
import { translatorFor } from './packs.js'
import type { ReportInput } from './resolve.js'

/** Recognisable, and no substring of an English unit. */
const UNITS: Record<string, string> = {
  'value.duration_under_minute': '< 1 minuut',
  'value.duration_minutes': '{m} minuten',
  'value.duration_hours': '{h} uur {m} minuten',
  'value.duration_days': '{d} dagen {h} uur',
}

const CLOCKS = {
  timeline: [{ time: '2026-01-01T08:00:00Z', description: 'eerste baken' }],
  openedAt: '2026-01-01T10:00:00Z',
  detectedAt: '2026-01-01T10:30:00Z',
  containedAt: '2026-01-01T12:00:00Z',
  status: 'closed',
  closedAt: '2026-01-01T12:30:00Z',
}

function input(strings: Record<string, string>): ReportInput {
  return {
    title: 'Onder test',
    tlp: '',
    language: 'nl',
    t: translatorFor({ code: 'nl', label: 'Nederlands', strings }),
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

/**
 * Beats reaching all three span paths the narrative prints.
 *
 * A run is keyed on the description and the side that said it, so two beats
 * share a row when they say the same thing: `derde baken` twice is one run
 * covering thirty minutes. A gap under the hour is printed on the row with a
 * `+`; an hour or more takes a band of its own.
 */
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

function withBeats(strings: Record<string, string>): ReportInput {
  return {
    ...input(strings),
    caseData: { id: 'c-1', title: 'Onder test', ...BEATS },
  }
}

describe('a gap between two beats in the narrative', () => {
  /**
   * **Asserted against the shape the old formatter printed**, not against the
   * absence of a letter: `m`, `h` and `d` all occur inside ordinary Dutch, so a
   * word-boundary match on them alone would fire on a correct document.
   */
  it('reads in the language the report is written in', () => {
    const printed = JSON.stringify(narrative(withBeats(UNITS)))

    expect(printed, 'a gap printed its own English unit').not.toMatch(/\+\d+[mhd]\b/)
    expect(printed, 'no gap reached the narrative at all, so this asserts nothing').toMatch(
      /uur|dagen|minuten/,
    )
  })

  /** The floor is English, as it is everywhere else the pack falls short. */
  it('falls back to English where the pack carries no unit', () => {
    const printed = JSON.stringify(narrative(withBeats({})))

    expect(printed).toMatch(/\bh\b|\bmin\b|\bd\b/)
  })

  /**
   * **One line carries two durations and they mean opposite things.** The `+`
   * is what separates time nobody accounted for from the time a run covers,
   * and it was inside the formatter before -- so the caller that wanted the
   * other one stripped it back off again.
   */
  it('marks the gap with a plus and the span it covers without one', () => {
    const printed = JSON.stringify(narrative(withBeats(UNITS)))

    expect(printed, 'no gap was marked as one').toMatch(/\+[^"]*uur|\+[^"]*minuten|\+[^"]*dagen/)
    // **Counted, because the shape to refuse is a `+` on the wrong duration.**
    // These beats print three spans -- one gap under the hour, one run that
    // covers half an hour, one band of five days -- and exactly the first owes
    // a plus.
    expect(
      (printed.match(/\+/g) ?? []).length,
      'a plus reached a span that is not a gap, or the gap lost its own',
    ).toBe(1)
  })
})

describe('a span printed in a report', () => {
  it('takes its units from the pack the report is written with', () => {
    const printed = values(metrics(input(UNITS))).join(' | ')

    expect(
      printed,
      'a span printed an English unit in a document whose pack carries its own',
    ).not.toMatch(/\b(min|h|d)\b/)
    expect(printed, 'no span reached the table at all, so this asserts nothing').toMatch(
      /minuten|uur|dagen/,
    )
  })

  /**
   * **The floor is English, as it is for every other key.** A pack that carries
   * no unit prints the English one rather than a key or a blank.
   */
  it('falls back to English where the pack carries no unit', () => {
    const printed = values(metrics(input({}))).join(' | ')

    expect(printed).toMatch(/\bmin\b/)
  })

  /**
   * **Every shape, because the table above reaches one of them.** A metrics row
   * is hours-and-minutes on any case an analyst would open, so the minutes and
   * days shapes would otherwise be declared here and rendered by nothing -- and
   * a later edit to either string would be free.
   */
  it.each([
    [30 * 60_000, '30 minuten'],
    [150 * 60_000, '2 uur 30 minuten'],
    [50 * 3_600_000, '2 dagen 2 uur'],
    [30_000, '< 1 minuut'],
  ])('prints every shape of span from the pack', (ms, expected) => {
    expect(duration(ms, translatorFor({ code: 'nl', label: 'Nederlands', strings: UNITS }))).toBe(
      expected,
    )
  })
})

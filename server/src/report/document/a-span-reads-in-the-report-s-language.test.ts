/**
 * **A span in a report reads in the language the report is written in.**
 *
 * The labels around the metric rows come from the pack; the units did not.
 * `duration` returned `min`, `h` and `d` whatever the document's language was,
 * so a Dutch report read `Verblijftijd: 2 h 15 min` -- a translated label and
 * an English value on one line. -> #645
 *
 * **Driven by a pack written here rather than by the shipped Dutch one.** What
 * this asserts is that the units come from wherever the words come from, and a
 * pack of real Dutch would tie the case to whichever keys somebody has got
 * round to carrying across -- `labels.nl.ts` is partial by design.
 *
 * **What this does not cover:** how a span is worded, which is the pack's, and
 * the client's own `durationText`, which prints in the interface's language
 * rather than the report's and is a separate vocabulary on purpose.
 */
import { describe, expect, it } from 'vitest'

import { metrics } from './derived.js'
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
})

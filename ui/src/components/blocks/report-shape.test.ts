import { describe, expect, it } from 'vitest'

import type { Report, ReportBlock } from '@/api/model'

import {
  DEMO_BLOCKS,
  DEMO_REPORTS,
  blocksOf,
  railSectionsOf,
  sectionTally,
  demoReport,
  headingIsFinal,
  headingOf,
  isFrozen,
  outstandingIn,
  shortDate,
  stateOf,
} from './report-shape'

/**
 * What the three report screens agree about a report, attacked.
 *
 * The two claims worth defeating are the freeze - which has to win over the
 * stored status in both directions - and what a report owes, which has to
 * refuse to name a gap in a document that already left.
 */

const first = demoReport(0)

function withSent(report: Report, sentAt: string | null): Report {
  return { ...report, sentAt }
}

function block(over: Partial<ReportBlock>): ReportBlock {
  const [any] = DEMO_BLOCKS
  if (any === undefined) throw new Error('the campaign fixture serves no report block')
  return { ...any, ...over }
}

describe('what a report is right now', () => {
  /**
   * `sentAt` is the freeze and the status is a stored word. A report left at
   * `draft` and sent is Sent, and one marked `final` and not sent is not.
   */
  it('lets the freeze win over the stored status in both directions', () => {
    expect(stateOf(withSent({ ...first, status: 'draft' }, '2026-08-19T09:00:00.000Z'))).toBe('Sent')
    expect(stateOf(withSent({ ...first, status: 'final' }, null))).toBe('Final')
    expect(stateOf(withSent({ ...first, status: 'draft' }, null))).toBe('Draft')
  })

  /**
   * The case the three above leave out, and the only one that isolates the
   * order of the two checks: a report marked `final` *and* sent is Sent.
   *
   * Found by mutation - reversing the two lines of `stateOf` left the suite
   * green, because every case tested set at most one of the two.
   */
  it('reads a report that is both final and sent as sent', () => {
    expect(stateOf(withSent({ ...first, status: 'final' }, '2026-08-19T09:00:00.000Z'))).toBe(
      'Sent',
    )
  })

  /** An empty `sentAt` is not a send. */
  it('does not read an empty stamp as sent', () => {
    expect(isFrozen(withSent(first, ''))).toBe(false)
    expect(stateOf(withSent({ ...first, status: 'draft' }, ''))).toBe('Draft')
  })
})

describe('what a report still owes', () => {
  const blank = block({ id: 'a', reportId: first.id, kind: 'written', hasProse: false })
  const written = block({ id: 'b', reportId: first.id, kind: 'written', hasProse: true })
  const generated = block({ id: 'c', reportId: first.id, kind: 'timeline', hasProse: false })

  /**
   * A generated section is empty by construction until the export composes it,
   * so counting one sends somebody to write what writes itself.
   */
  it('never names a generated section as owed', () => {
    expect(outstandingIn(first, [generated]).map((one) => one.id)).toEqual([])
  })

  it('names a written section nobody has written', () => {
    expect(outstandingIn(first, [blank, written, generated]).map((one) => one.id)).toEqual(['a'])
  })

  /**
   * A frozen report owes nothing whatever is in it: the document left, and
   * naming a gap there is an instruction to do what the app refuses.
   */
  it('owes nothing once the report is frozen', () => {
    const sent = withSent(first, '2026-08-19T09:00:00.000Z')
    expect(outstandingIn(sent, [blank, blank, blank])).toEqual([])
  })

  /**
   * A figure holds an evidence id rather than prose, and blank means nobody
   * chose a picture - so it counts exactly as a written section does.
   */
  it('counts a figure with nothing chosen', () => {
    const figure = block({ id: 'd', reportId: first.id, kind: 'figure', hasProse: false })
    expect(outstandingIn(first, [figure]).map((one) => one.id)).toEqual(['d'])
  })
})

describe('one report out of the table', () => {
  /** A report takes its own rows and nobody else's. */
  it('takes only the blocks belonging to that report', () => {
    for (const report of DEMO_REPORTS) {
      for (const one of blocksOf(DEMO_BLOCKS, report.id)) {
        expect(one.reportId).toBe(report.id)
      }
    }
  })

  /** The export prints them by `position`, whatever order the table arrived in. */
  it('orders by position rather than by arrival', () => {
    const scrambled = [...DEMO_BLOCKS].reverse()
    const own = blocksOf(scrambled, first.id)
    expect(own.map((one) => one.position)).toEqual(
      [...own.map((one) => one.position)].sort((left, right) => left - right),
    )
    expect(own.length).toBeGreaterThan(1)
  })
})

describe('what a section is called', () => {
  /** A stored heading is the analyst's own and beats every derivation. */
  it('prefers the stored heading over the key and the kind', () => {
    expect(
      headingOf(block({ heading: 'Our own words', headingKey: 'heading.analysis', kind: 'written' })),
    ).toBe('Our own words')
  })

  /** A key the pack resolves reads as words, and is final. */
  it('resolves a key the pack knows', () => {
    const one = block({ heading: '', headingKey: 'heading.exec_summary', kind: 'written' })
    expect(headingOf(one)).toBe('Executive summary')
    expect(headingIsFinal(one)).toBe(true)
  })

  /**
   * A key the pack has no entry for falls back to the key itself and is marked
   * not final - inventing English words here is how a Dutch report grows an
   * English heading.
   */
  it('falls back to the key and marks it not final', () => {
    const one = block({ heading: '', headingKey: 'heading.nothing_here', kind: 'written' })
    expect(headingOf(one)).toBe('heading.nothing_here')
    expect(headingIsFinal(one)).toBe(false)
  })

  /** With neither, the kind's served label stands in and is final. */
  it('uses the kind label when there is no heading and no key', () => {
    const one = block({ heading: '', headingKey: '', kind: 'timeline' })
    expect(headingOf(one)).toBe('Timeline of events')
    expect(headingIsFinal(one)).toBe(true)
  })
})

describe('a report date', () => {
  /**
   * Sliced rather than parsed: a report created at 23:40 UTC would be dated a
   * day later for half the world, and the index would then disagree with the
   * export.
   */
  it('reads the stamp rather than the viewer clock', () => {
    expect(shortDate('2026-08-13T23:40:00.000Z')).toBe('13 Aug')
    expect(shortDate('2026-01-01T00:00:00.000Z')).toBe('1 Jan')
    expect(shortDate('2026-12-31T23:59:59.999Z')).toBe('31 Dec')
  })

  /** A stamp it cannot read is handed back rather than printed as `NaN`. */
  it('hands back what it cannot read', () => {
    expect(shortDate('not-a-date')).toBe('not-a-date')
    expect(shortDate('2026-13-01T00:00:00.000Z')).toBe('2026-13-01')
  })
})

describe('the rail down the side of the document', () => {
  const report = first
  const rows = (blocks: ReportBlock[]) => railSectionsOf(report, blocks)

  const written = block({ id: 'w', reportId: report.id, position: 1, kind: 'written',
    heading: 'Root cause', hasProse: true })
  const empty = block({ id: 'e', reportId: report.id, position: 2, kind: 'written',
    heading: 'Recommendations', hasProse: false })
  const generated = block({ id: 'g', reportId: report.id, position: 0, kind: 'timeline',
    heading: '', headingKey: '', hasProse: false })

  /**
   * The state dot is the whole reason this is not a list of links, and the
   * question it answers is what nobody has written. A generated section is
   * empty by construction until the export composes it, so marking one sends
   * somebody to write what writes itself.
   */
  it('never marks a generated section as unwritten', () => {
    const [row] = rows([generated])
    expect(row?.written).toBe(false)
    expect(row?.blank).toBe(false)
  })

  it('marks a written section nobody has written', () => {
    expect(rows([written, empty]).map((row) => [row.id, row.blank])).toEqual([
      ['w', false],
      ['e', true],
    ])
  })

  /** A figure holds an evidence id rather than prose, and counts as written. */
  it('counts a figure as a section somebody has to fill', () => {
    const figure = block({ id: 'f', reportId: report.id, position: 3, kind: 'figure',
      hasProse: false })
    const [row] = rows([figure])
    expect(row?.written).toBe(true)
    expect(row?.blank).toBe(true)
  })

  /** A frozen report owes nothing, so the rail marks nothing. */
  it('marks nothing on a report that has been sent', () => {
    const sent = withSent(report, '2026-08-19T09:00:00.000Z')
    expect(railSectionsOf(sent, [empty]).map((row) => row.blank)).toEqual([false])
  })

  /**
   * The number is the one the export prints, so it follows `position` and not
   * the order the table arrived in.
   */
  it('numbers by position rather than by arrival', () => {
    expect(rows([empty, written, generated]).map((row) => [row.number, row.id])).toEqual([
      [1, 'g'],
      [2, 'w'],
      [3, 'e'],
    ])
  })

  /**
   * The same name the section carries in the document. A rail naming a section
   * differently from the column beside it is worse than no rail, and a key the
   * pack cannot answer stays a key rather than becoming invented English.
   */
  it('names a section as the document names it', () => {
    const keyed = block({ id: 'k', reportId: report.id, position: 0, kind: 'written',
      heading: '', headingKey: 'heading.nothing_here' })
    expect(rows([keyed]).map((row) => row.heading)).toEqual(['heading.nothing_here'])
  })

  /** Another report's rows are not this report's rail. */
  it('takes only the sections of its own report', () => {
    const other = block({ id: 'x', reportId: 'somebody-else', position: 0, kind: 'written' })
    expect(rows([written, other]).map((row) => row.id)).toEqual(['w'])
  })
})

describe('what the strip says about the document', () => {
  const report = first
  const written = block({ id: 'w', reportId: report.id, position: 0, kind: 'written',
    hasProse: true })
  const empty = block({ id: 'e', reportId: report.id, position: 1, kind: 'written',
    hasProse: false })
  const generated = block({ id: 'g', reportId: report.id, position: 2, kind: 'timeline' })

  /** Sections is every section; written counts only the ones an analyst fills. */
  it('counts the sections and the ones somebody has written', () => {
    expect(sectionTally(report, [written, empty, generated])).toBe(
      '3 sections \u00b7 1 of 2 written',
    )
  })

  /** A report of only generated sections has nothing to write, and says so. */
  it('says nothing about writing where there is none to do', () => {
    expect(sectionTally(report, [generated])).toBe('1 section')
  })

  /** A frozen report is a document, not a to-do list. */
  it('drops the count once the report has been sent', () => {
    const sent = withSent(report, '2026-08-19T09:00:00.000Z')
    expect(sectionTally(sent, [written, empty, generated])).toBe('3 sections')
  })

  it('has no sections to count on an empty report', () => {
    expect(sectionTally(report, [])).toBe('No sections')
  })
})

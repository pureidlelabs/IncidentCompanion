/**
 * **The demo reports, checked against what they name.**
 *
 * The prose was generated from Python's own builders rather than retyped, so
 * what is worth asserting is not the words: it is that every layout, kind and
 * language a report names is one this server has. A generated file agrees with
 * its generator by construction and with the app by luck.
 */
import { describe, expect, it } from 'vitest'

import { DEMO_CASES } from './catalogue.js'
import { DEMO_REPORTS } from './reports.js'
import { BUILTIN_REPORT_LAYOUTS } from '../library/builtins/report-layouts.js'
import { BLOCK_KINDS, REPORT_STAGES } from '../domain/entities/report.js'
import { EN_KEYS } from '../report/document/packs.js'

const everyReport = Object.entries(DEMO_REPORTS).flatMap(([reference, reports]) =>
  reports.map((report) => ({ reference, ...report })),
)

describe('the reports the demos ship with', () => {
  /** The counts Python's builders produced, so a lost case or report is loud. */
  it('carries all eighteen, across the six cases', () => {
    expect(Object.keys(DEMO_REPORTS)).toHaveLength(6)
    expect(everyReport).toHaveLength(18)
    expect(everyReport.flatMap((report) => report.blocks)).toHaveLength(91)
  })

  /**
   * **Every report belongs to a case that exists.** A reference that drifted
   * seeds nothing and raises nothing - the map is keyed by string, so a typo
   * is a demo silently without reports.
   */
  it('is keyed by references the catalogue has', () => {
    const known = new Set(DEMO_CASES.map((demo) => demo.reference))
    const strangers = Object.keys(DEMO_REPORTS).filter((reference) => !known.has(reference))
    expect(strangers).toEqual([])
  })

  /** Every case has at least one, since a picker of empty report panes shows nothing. */
  it('gives every demo case a report', () => {
    for (const demo of DEMO_CASES) {
      expect(DEMO_REPORTS[demo.reference], `${demo.reference} has no reports`).toBeDefined()
    }
  })

  /**
   * **A layout name that no longer ships seeds a report nothing can restore**:
   * `missing-sections` reads the layout to know what is required, and answers
   * nothing at all when it cannot find it.
   */
  it('names only layouts the library ships', () => {
    const shipped = new Set(BUILTIN_REPORT_LAYOUTS.map((layout) => layout.name))
    const strangers = everyReport.filter((report) => !shipped.has(report.template))
    expect(strangers.map((report) => `${report.reference}: ${report.template}`)).toEqual([])
  })

  it('names only block kinds the app has', () => {
    const known = new Set<string>(BLOCK_KINDS)
    const strangers = everyReport
      .flatMap((report) => report.blocks)
      .filter((block) => !known.has(block.kind))
    expect(strangers).toEqual([])
  })

  /**
   * A stage outside the vocabulary is a filing labelled with something
   * meaningless.
   *
   * **Guarded against an empty vocabulary**, because the first draft imported
   * `REPORT_STAGES` from a module that does not export it: the set was built
   * from `undefined`, and every stage read as a stranger. Inverted, that
   * mistake passes silently instead.
   */
  it('uses only stages the app offers', () => {
    const known = new Set<string>(REPORT_STAGES)
    expect(known.size, 'the stage vocabulary did not load').toBeGreaterThan(0)
    const strangers = everyReport
      .map((report) => report.stage)
      .filter((stage): stage is string => Boolean(stage) && !known.has(stage!))
    expect(strangers).toEqual([])
  })

  /**
   * **A written block carries prose.** An empty one seeds a section with a
   * heading and nothing under it, which is what a half-finished port looks
   * like and is indistinguishable from a deliberate placeholder.
   */
  it('gives every written section something written', () => {
    const empty = everyReport
      .flatMap((report) => report.blocks.map((block) => ({ label: report.label, ...block })))
      .filter((block) => block.kind === 'written' && !block.body?.trim())
    expect(empty.map((block) => `${block.label}: ${block.headingKey ?? block.heading ?? ''}`)).toEqual(
      [],
    )
  })

  /** A sent report that was never created is a timeline nobody can read. */
  it('never sends a report before it was created', () => {
    const backwards = everyReport.filter(
      (report) => report.sentAtMinute !== undefined && report.sentAtMinute < report.createdAtMinute,
    )
    expect(backwards.map((report) => report.label)).toEqual([])
  })

  /**
   * **At least one is filed**, because a sent report is frozen and every
   * export paints the frozen tree rather than re-resolving the case - a demo
   * set with no sent report never shows that half of the lifecycle.
   */
  it('files at least one report', () => {
    expect(everyReport.some((report) => report.sentAtMinute !== undefined)).toBe(true)
  })

  /**
   * **A key the pack does not carry prints itself.** The shipped layouts are
   * checked against `EN_KEYS` already; the demo reports are a second, separate
   * source of heading keys, and `heading.root_cause` was in every demo report
   * and in no pack -- so the first screen anybody opens titled three sections
   * by string surgery on the key, in English, in both languages.
   */
  it('name only heading keys the English pack carries', () => {
    const named = everyReport.flatMap((report) =>
      report.blocks.map((block) => block.headingKey).filter((key): key is string => !!key),
    )
    expect(named.length).toBeGreaterThan(0)

    const missing = [...new Set(named)].filter((key) => !EN_KEYS.includes(key)).sort()
    expect(missing, 'a demo report titles a section with a key nothing resolves').toEqual([])
  })
})

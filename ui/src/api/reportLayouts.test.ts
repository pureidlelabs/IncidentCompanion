/**
 * The heading pack has to survive the layer between the route and the screen.
 */
import { describe, expect, it } from 'vitest'

import { fromWire } from './naming'
import { headingLabelsByKey, type ReportLayoutListing } from './reportLayouts'

describe('the heading pack as it crosses the wire', () => {
  /**
   * **`fromWire` rewrites every key in a response, and these keys are data.**
   *
   * Measured against the running server: the route sent
   * `heading.exec_summary: 'Executive summary'`, the browser received it, and
   * the screen still printed "Exec summary". `toCamel` had turned the key into
   * `heading.execSummary` on the way in, so the lookup missed and every written
   * section fell back to prettifying its own key -- in English, in every
   * language. Both halves were correct in isolation, which is why no test on
   * either side was red.
   *
   * Testing through `fromWire` rather than against the raw body is the whole
   * point: a map keyed by data cannot be checked anywhere the converter is not.
   */
  it('resolves a key the converter would have rewritten', () => {
    const served = fromWire<ReportLayoutListing>({
      layouts: [],
      headings: [
        { key: 'heading.exec_summary', label: 'Executive summary' },
        { key: 'heading.what_happened', label: 'What happened' },
      ],
    })

    const labels = headingLabelsByKey(served)
    expect(labels['heading.exec_summary']).toBe('Executive summary')
    expect(labels['heading.what_happened']).toBe('What happened')
  })
})

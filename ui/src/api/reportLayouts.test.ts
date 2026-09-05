/**
 * The heading pack has to survive the layer between the route and the screen.
 */
import { describe, expect, it } from 'vitest'

import { fromWire } from './naming'
import { headingLabelsByKey, type ReportLayoutListing } from './reportLayouts'

describe('the heading pack as it crosses the wire', () => {
  /**
   * **`fromWire` rewrites every key in a response, and these keys are data.**
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

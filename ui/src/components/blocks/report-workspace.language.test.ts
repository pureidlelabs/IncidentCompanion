import { describe, expect, it } from 'vitest'

import { labelsFor } from './report-workspace'

/**
 * **What an analyst is told at the moment they choose.**
 *
 * **A complete pack says nothing extra**, which is the half that keeps this
 * useful: a percentage on every row is a number nobody reads, and the point is
 * that an incomplete one stands out.
 */
describe('the label a language is offered under', () => {
  it('says how much of a partial pack is translated', () => {
    const labels = labelsFor([{ code: 'nl', label: 'Nederlands', coverage: 0.12 }])

    expect(labels.nl).toBe('Nederlands \u00b7 12%')
  })

  it('says nothing extra for a complete one', () => {
    const labels = labelsFor([{ code: 'nl', label: 'Nederlands', coverage: 1 }])

    expect(labels.nl).toBe('Nederlands')
  })

  /**
   * English is synthesised rather than stored and is always whole, so it is
   * the case that would look wrong if coverage were drawn unconditionally.
   */
  it('says nothing extra for English', () => {
    const labels = labelsFor([{ code: 'en', label: 'English', coverage: 1 }])

    expect(labels.en).toBe('English')
  })

  it('still names the report that has chosen none', () => {
    expect(labelsFor([])['']).toBe('The install\u2019s own')
  })

  /**
   * A pack whose coverage the caller does not know is drawn as a plain name
   * rather than as `NaN%`: the picker is given whatever the languages query
   * answered, and a shape without coverage is a caller not passing it.
   */
  it('draws a plain name where coverage is not given', () => {
    const labels = labelsFor([{ code: 'de', label: 'Deutsch' }])

    expect(labels.de).toBe('Deutsch')
  })
})

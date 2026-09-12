/**
 * Sentinel's severity word against this product's vocabulary, and what a
 * payload of incidents marks the case it opens.
 *
 * **Not covered here:** that the create door reads this rather than its body.
 * -> `test/incident-import.test.ts`
 */
import { describe, expect, it } from 'vitest'

import { caseSeverityOf, severityOf } from './severity.js'

describe("a provider's severity word", () => {
  it('takes the spelling Sentinel actually sends', () => {
    expect(severityOf('High')).toBe('high')
    expect(severityOf('Medium')).toBe('medium')
    expect(severityOf('Low')).toBe('low')
    expect(severityOf('Informational')).toBe('informational')
  })

  it('is read through its case and its padding, which a vendor string carries', () => {
    expect(severityOf('  HIGH  ')).toBe('high')
    expect(severityOf('mEdIuM')).toBe('medium')
  })

  it('answers null for a word this vocabulary cannot say', () => {
    expect(severityOf('Critical')).toBeNull()
    expect(severityOf('Sev1')).toBeNull()
    expect(severityOf('')).toBeNull()
  })

  /** The key is somebody else's JSON, so a bare object's own members are input. */
  it('answers null for what is not a severity at all', () => {
    expect(severityOf('__proto__')).toBeNull()
    expect(severityOf('constructor')).toBeNull()
    expect(severityOf(undefined)).toBeNull()
    expect(severityOf(null)).toBeNull()
    expect(severityOf(42)).toBeNull()
    expect(severityOf({ toString: () => 'High' })).toBeNull()
  })
})

describe('what a payload marks the case it opens', () => {
  it('is the worst the provider reported, whichever order it arrived in', () => {
    expect(caseSeverityOf([{ severity: 'Low' }, { severity: 'High' }])).toBe('high')
    expect(caseSeverityOf([{ severity: 'High' }, { severity: 'Low' }])).toBe('high')
    expect(caseSeverityOf([{ severity: 'Informational' }, { severity: 'Medium' }])).toBe('medium')
  })

  it('ignores an incident the provider left unmarked rather than counting it as the floor', () => {
    expect(caseSeverityOf([{ severity: '' }, { severity: 'Medium' }])).toBe('medium')
    expect(caseSeverityOf([{ severity: 'Sev1' }, { severity: 'Low' }])).toBe('low')
  })

  it('leaves the case unmarked when nothing named a level it can say', () => {
    expect(caseSeverityOf([])).toBeNull()
    expect(caseSeverityOf([{ severity: '' }])).toBeNull()
    expect(caseSeverityOf([{ severity: 'Sev1' }])).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { exactly, whenAgo } from './whenAgo'

const NOW = new Date('2026-08-02T12:00:00Z').getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('whenAgo', () => {
  it('says nothing for a stamp the server could not read', () => {
    // Two shapes a stamp arrives in that name no moment: absent, and present
    // but unparseable. Both answer with nothing rather than `Invalid Date`.
    expect(whenAgo('', NOW)).toBe('')
    expect(whenAgo('not a date', NOW)).toBe('')
  })

  it('collapses the last minute rather than counting seconds', () => {
    expect(whenAgo(ago(5_000), NOW)).toBe('just now')
    expect(whenAgo(ago(59_000), NOW)).toBe('just now')
  })

  it('steps up through minutes, hours and days', () => {
    expect(whenAgo(ago(3 * MINUTE), NOW)).toMatch(/3 minutes ago/)
    expect(whenAgo(ago(2 * HOUR), NOW)).toMatch(/2 hours ago/)
    expect(whenAgo(ago(3 * DAY), NOW)).toMatch(/3 days ago/)
  })

  it('gives a date once relative time stops meaning anything', () => {
    const out = whenAgo(ago(40 * DAY), NOW)
    expect(out).not.toMatch(/ago/)
    expect(out).toMatch(/Jun/)
  })

  it('carries the year only when it is not this one', () => {
    expect(whenAgo(ago(20 * DAY), NOW)).not.toMatch(/2026/)
    expect(whenAgo(ago(400 * DAY), NOW)).toMatch(/2025/)
  })

  it('does not render a clock disagreement as the future', () => {
    expect(whenAgo(new Date(NOW + 3 * MINUTE).toISOString(), NOW)).toBe('just now')
  })

  it('offers the full stamp for the title the short form stands in for', () => {
    expect(exactly('')).toBeUndefined()
    expect(exactly('not a date')).toBeUndefined()
    expect(exactly(ago(HOUR))).toContain('2026')
  })
})

/**
 * How a row's last write reads.
 *
 * The phrasing is the decision here: the question the analyst is asking is
 * *is my copy stale*, not *what time was it*, so the label is coarse and the
 * exact time stays in the change record.
 */
import { describe, expect, it } from 'vitest'

import { agoLabel, editedLabel, stampFor } from './attribution'

const NOW = 1_700_000_000

describe('agoLabel', () => {
  it('says "just now" under a minute', () => {
    // Not "0m ago", which reads as a rounding error rather than as now.
    expect(agoLabel(NOW - 5, NOW)).toBe('just now')
    expect(agoLabel(NOW - 59, NOW)).toBe('just now')
  })

  it('counts minutes, then hours, then days', () => {
    expect(agoLabel(NOW - 60, NOW)).toBe('1m ago')
    expect(agoLabel(NOW - 59 * 60, NOW)).toBe('59m ago')
    expect(agoLabel(NOW - 60 * 60, NOW)).toBe('1h ago')
    expect(agoLabel(NOW - 23 * 3600, NOW)).toBe('23h ago')
    expect(agoLabel(NOW - 24 * 3600, NOW)).toBe('1d ago')
  })

  it('does not run backwards on a clock that disagrees', () => {
    // The stamp is the *server's* clock and this is the browser's. A row
    // written half a second in the future must not read "-1m ago", which
    // looks like corruption rather than like clock skew.
    expect(agoLabel(NOW + 30, NOW)).toBe('just now')
  })
})

describe('editedLabel', () => {
  it('names the analyst when there is one', () => {
    expect(editedLabel({ by: 'r.okonkwo', at: NOW - 120, version: 3 }, NOW))
      .toBe('2m ago by r.okonkwo')
  })

  it('still says when, with no name', () => {
    // An import, a demo seed or a bearer stamps the time and no author.
    // Dropping the line would throw away the half that answers the question.
    expect(editedLabel({ by: '', at: NOW - 120, version: 1 }, NOW))
      .toBe('2m ago')
  })
})

describe('stampFor', () => {
  // A `Map` keyed `"table:id"`, because the feed is served as a list: an
  // object keyed by table name would have `network_indicators` camelised on
  // the way in by `client.request`, matching nothing and failing nowhere.
  const feed = new Map([['timeline:t-1', { by: 'a', at: NOW, version: 1 }]])

  it('finds a row', () => {
    expect(stampFor(feed, 'timeline', 't-1')?.by).toBe('a')
  })

  it('is undefined for a table or a row it has never heard of', () => {
    // A row nobody has written is absent from the feed rather than present
    // and empty, so every reader has exactly one shape to handle.
    expect(stampFor(feed, 'timeline', 'nope')).toBeUndefined()
    expect(stampFor(feed, 'systems', 't-1')).toBeUndefined()
    expect(stampFor(undefined, 'timeline', 't-1')).toBeUndefined()
  })
})

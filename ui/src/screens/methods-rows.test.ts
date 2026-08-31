import { describe, expect, it } from 'vitest'

import type { MethodEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

import { matchesMethod, rowsText, windowText } from './methods-rows'

/**
 * The Methods table's arithmetic, attacked rather than demonstrated.
 *
 * Each case here is one the demo does not hold: a stated zero, half a window,
 * a query whose keywords appear in every other row's query too.
 */

/** A method carrying a value in each field the search box could have read. */
const method = (over: Partial<MethodEntry> = {}): MethodEntry => ({
  ...campaignCase.methods[0]!,
  name: 'Sentinel proxy sweep',
  established: 'Exfiltration of three archives',
  kind: 'siem query',
  console: 'Microsoft Sentinel',
  workspace: 'meridian-prod-law',
  runBy: 'R. Okonkwo',
  query: 'CommonSecurityLog\n| where DeviceAction == "allow"',
  resultColumns: 'SourceIP;DestinationHostName',
  resultExcerpt: '10.4.2.9 mega-sync-store.example',
  tags: 'exfiltration',
  ...over,
})

describe('the methods search reads the Name column', () => {
  it('matches a word in the name', () => {
    expect(matchesMethod(method(), 'proxy')).toBe(true)
  })

  it.each([
    ['What it established', 'archives'],
    ['Kind', 'siem'],
    ['Console', 'microsoft'],
    ['Workspace, which is no column at all', 'meridian'],
    ['Run by, which is no column at all', 'okonkwo'],
    ['Columns returned, which is no column at all', 'destinationhostname'],
    ['a tag, which is no column at all', 'exfiltration'],
  ])('refuses a value that is only in %s', (_column, term) => {
    expect(matchesMethod(method(), term)).toBe(false)
  })

  /**
   * The one this collection has and no other does: a query is 200 characters
   * of a language, so a haystack including it matches `where`, `summarize`
   * and every table name on rows that have nothing to do with the search.
   */
  it('refuses a word that is only in the query or the recorded result', () => {
    expect(matchesMethod(method(), 'commonsecuritylog')).toBe(false)
    expect(matchesMethod(method(), 'mega-sync-store')).toBe(false)
  })

  it('is AND across terms, so a second word narrows rather than widens', () => {
    expect(matchesMethod(method(), 'sentinel sweep')).toBe(true)
    expect(matchesMethod(method(), 'sentinel mailbox')).toBe(false)
  })

  it('leaves every row when the query is blank', () => {
    expect(campaignCase.methods.every((one) => matchesMethod(one, '   '))).toBe(true)
  })
})

describe('the window column', () => {
  const from = '2026-08-13T16:00:00.000Z'
  const to = '2026-08-13T18:00:00.000Z'

  it('prints both ends to the minute, in the order they were stated', () => {
    expect(windowText(method({ windowFrom: from, windowTo: to }))).toBe(
      '2026-08-13 16:00 \u2192 2026-08-13 18:00',
    )
  })

  /**
   * **Neither end is derived from the other**, so half a window draws as half
   * a window. A build that filled the missing end from the stated one would
   * put a span in the report the analyst never claimed.
   */
  it('names the half that is missing rather than inventing it', () => {
    expect(windowText(method({ windowFrom: from, windowTo: null }))).toBe(
      '2026-08-13 16:00 \u2192 \u2014',
    )
    expect(windowText(method({ windowFrom: null, windowTo: to }))).toBe(
      '\u2014 \u2192 2026-08-13 18:00',
    )
  })

  it('draws nothing at all when neither end was stated', () => {
    expect(windowText(method({ windowFrom: null, windowTo: null }))).toBe('')
  })

  /** A blank string is not a stamp: it would otherwise print an arrow to nowhere. */
  it('treats an empty stamp as unstated rather than as a value', () => {
    expect(windowText(method({ windowFrom: '', windowTo: '   ' }))).toBe('')
  })
})

describe('the rows-returned column', () => {
  /**
   * **`null` is *not stated* and `0` is *nothing came back*.** Two different
   * facts, and every falsy test collapses them into the same cell.
   */
  it('prints a stated zero and leaves an unstated count absent', () => {
    expect(rowsText(method({ rowsReturned: 0 }))).toBe('0')
    expect(rowsText(method({ rowsReturned: null }))).toBeNull()
    expect(rowsText(method({ rowsReturned: 12 }))).toBe('12')
  })
})

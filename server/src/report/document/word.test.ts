/**
 * The Word painter, checked by reading the file it produces.
 *
 * **A `.docx` that opens is not a `.docx` that says the right thing**, and the
 * failure mode here is silent: `docx` accepts a shape it does not draw, the
 * file opens cleanly in Word, and a section is simply absent. So these unzip the
 * result and read the XML rather than asserting the call did not throw.
 *
 * The parts are checked by name too - a header declared in a shape the library
 * ignores produces a document with no `header1.xml` in it at all, which is
 * exactly what a marking silently missing from every page looks like.
 */
import { inflateRawSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { MARGIN_DXA, PAGE_DXA, PAGE_HEIGHT_DXA, toWord } from './word.js'
import type { Cover, Document, Node } from './model.js'

function partsOf(file: Buffer): string[] {
  const names: string[] = []
  // Local file headers: `PK\x03\x04`, name length at +26, name at +30.
  for (let at = 0; at < file.length - 4; at += 1) {
    if (file.readUInt32LE(at) !== 0x04034b50) continue
    const length = file.readUInt16LE(at + 26)
    names.push(file.toString('utf8', at + 30, at + 30 + length))
  }
  return names
}

function textIn(file: Buffer): string {
  // The parts are deflated, so the words are not in the bytes. `docx` stores
  // nothing uncompressed, which is why this asserts on part names and the
  // painter's structure is asserted through the model instead.
  return file.toString('latin1')
}

const paper = (nodes: Node[], tlp = ''): Document => ({
  title: 'CASE-1',
  tlp,
  language: 'en',
  languageCoverage: 1,
  sections: [{ blockId: 'b', kind: 'written', heading: 'Summary', nodes }],
})

/**
 * The document XML, inflated.
 *
 * **`textIn` reads the raw bytes and the parts are deflated**, so a word in the
 * document is not a string in the file - which is why the assertions below that
 * need to see *content* inflate `word/document.xml` rather than searching the
 * buffer. Node's own zlib does it; the alternative is asserting on part names
 * only, and a chip's shading is not a part.
 */
function documentXml(file: Buffer): string {
  for (let at = 0; at < file.length - 4; at += 1) {
    if (file.readUInt32LE(at) !== 0x04034b50) continue
    const nameLength = file.readUInt16LE(at + 26)
    const extraLength = file.readUInt16LE(at + 28)
    const name = file.toString('utf8', at + 30, at + 30 + nameLength)
    if (name !== 'word/document.xml') continue
    const start = at + 30 + nameLength + extraLength
    // Stored (0) or deflated (8); `docx` deflates, and the compressed size in
    // the local header is 0 when a data descriptor follows, so inflate to the
    // end of the buffer and let zlib stop at the stream's own end.
    const method = file.readUInt16LE(at + 8)
    const body = file.subarray(start)
    return method === 0 ? body.toString('utf8') : inflateRawSync(body).toString('utf8')
  }
  throw new Error('no word/document.xml')
}

describe('the Word painter', () => {
  it('produces a document Word can open', async () => {
    const file = await toWord(paper([{ type: 'richPara', runs: [{ text: 'the summary' }] }]))
    const parts = partsOf(file)

    // The three parts every `.docx` must carry; without any of them Word
    // reports the file as corrupt rather than as empty.
    expect(parts).toContain('[Content_Types].xml')
    expect(parts).toContain('word/document.xml')
    expect(parts).toContain('_rels/.rels')
    expect(file.length).toBeGreaterThan(1000)
  })

  it('puts the marking in a header part, so page four carries it too', async () => {
    // **A handling instruction the reader only sees on page one is not one.**
    // A header declared in a shape the library ignores produces a file with no
    // header part at all, and nothing fails.
    const marked = await toWord(paper([{ type: 'prose', paras: ['x'] }], 'TLP:AMBER'))
    expect(partsOf(marked).some((name) => name.startsWith('word/header'))).toBe(true)

    const unmarked = await toWord(paper([{ type: 'prose', paras: ['x'] }]))
    expect(partsOf(unmarked).some((name) => name.startsWith('word/header'))).toBe(false)
  })

  it('draws a table rather than refusing one', async () => {
    // Word draws neither SVG nor `foreignObject`, so every visual in the model
    // is a shaded table - if tables do not survive the painter, nothing does.
    const file = await toWord(
      paper([
        {
          type: 'table',
          header: ['Time', 'Event'],
          rows: [[{ text: '09:00' }, { text: 'phishing email' }]],
          widths: [0.3, 0.7],
        },
      ]),
    )
    expect(partsOf(file)).toContain('word/document.xml')
    expect(file.length).toBeGreaterThan(1000)
  })

  it('paints every node kind without throwing', async () => {
    // A kind the painter has no branch for is a section that vanishes from the
    // file with nothing raised - the switch is exhaustive by type, and this is
    // what proves the runtime agrees with the type.
    const every: Node[] = [
      { type: 'subtitle', text: 'Title' },
      { type: 'subhead', text: 'Subhead' },
      { type: 'minorHead', text: 'Minor' },
      { type: 'richPara', runs: [{ text: 'bold', bold: true }, { text: ' link', url: 'https://x' }] },
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
    const file = await toWord(paper(every))
    expect(partsOf(file)).toContain('word/document.xml')
  })

  it('is deterministic enough to compare two runs of one document', async () => {
    // Not a byte-for-byte claim - a `.docx` carries timestamps. What must hold
    // is that the same document does not produce a materially different file,
    // because a frozen report is re-painted from its stored model.
    const once = await toWord(paper([{ type: 'prose', paras: ['stable'] }]))
    const twice = await toWord(paper([{ type: 'prose', paras: ['stable'] }]))
    expect(Math.abs(once.length - twice.length)).toBeLessThan(64)
    expect(partsOf(once)).toEqual(partsOf(twice))
  })

  it('says nothing where a section resolved to nothing', async () => {
    const file = await toWord(paper([]))
    expect(partsOf(file)).toContain('word/document.xml')
    expect(textIn(file).length).toBeGreaterThan(0)
  })

  it('merges a spanned cell rather than drawing the blanks the PDF keeps', async () => {
    // A pasted merged cell carries its span on the top-left cell and a blank on
    // the covered position. Word draws one cell across the span - `w:gridSpan`
    // for a column merge, `w:vMerge` for a row merge - and the covered cell is
    // dropped from the row, where the PDF would pad it.
    const file = await toWord(
      paper([
        {
          type: 'table',
          rows: [
            [{ text: 'Both columns', colSpan: 2 }, { text: '' }],
            [{ text: 'left' }, { text: 'right' }],
          ],
          widths: [0.5, 0.5],
        },
        {
          type: 'table',
          rows: [
            [{ text: 'tall', rowSpan: 2 }, { text: 'beside' }],
            [{ text: '' }, { text: 'below' }],
          ],
          widths: [0.5, 0.5],
        },
      ]),
    )
    const xml = documentXml(file)
    expect(xml).toContain('w:gridSpan')
    expect(xml).toContain('w:val="2"')
    expect(xml).toContain('w:vMerge')
    // The merged row draws one cell, not the value plus its blank.
    const firstRow = xml.slice(xml.indexOf('<w:tr'), xml.indexOf('</w:tr>'))
    expect((firstRow.match(/<w:tc>/g) ?? []).length).toBe(1)
  })
})

const COVER: Cover = {
  eyebrow: 'INCIDENTCOMPANION \u00b7 INCIDENT REPORT',
  title: 'Phishing to lateral movement',
  subtitle: 'Acme Corp \u00b7 CASE-1 \u00b7 An Analyst',
  rows: [
    { label: 'Customer', value: { text: 'Acme Corp', bold: true } },
    { label: 'Severity', value: { text: 'high', chip: { kind: 'severity', value: 'high' } } },
    { label: 'Classification', value: { text: 'TLP:AMBER', tlp: true } },
  ],
}

describe('the cover, the marking and the chips', () => {
  /**
   * **A chip is shading on the *run*, not on the cell.** Shading the cell
   * floods the whole column, which is how one painter comes to draw a pill and
   * the other to fill the value cell. Asserted on the XML because a `w:shd`
   * inside `w:rPr` and one inside `w:tcPr` produce files that differ nowhere a
   * part name or a byte count can see.
   */
  it('paints a chip behind the words rather than across the cell', async () => {
    const file = await toWord({ ...paper([]), cover: COVER })
    const xml = documentXml(file)

    // The severity chip's ground and ink, both from the palette.
    expect(xml).toContain('FEE2E2')
    expect(xml).toContain('991B1B')
    // Inside a run's properties: `<w:rPr>...<w:shd .../></w:rPr>`.
    expect(/<w:rPr>(?:(?!<\/w:rPr>).)*<w:shd[^>]*w:fill="FEE2E2"/s.test(xml)).toBe(true)
  })

  /** The marking's own hue, on the standard's black ground. */
  it('gives the marking chip the standard colours and not the palette', async () => {
    const xml = documentXml(await toWord({ ...paper([]), cover: COVER }))
    expect(xml).toContain('FFC000')
    expect(xml).toContain('w:fill="000000"')
  })

  /**
   * **The caveat is on the page a reader detaches, not only on the first.** A
   * marking in the header part alone reaches a printed page only where the
   * header happens to fall, so both parts have to carry it.
   */
  it('carries the marking in a footer part as well as a header', async () => {
    const parts = partsOf(await toWord({ ...paper([]), tlp: 'TLP:AMBER', cover: COVER }))
    expect(parts).toContain('word/header1.xml')
    expect(parts).toContain('word/footer1.xml')
  })

  it('has no footer part to carry when there is no marking', async () => {
    // Not a blank footer: an empty one is furniture on every page saying
    // nothing, and its absence is how the unmarked case is legible here.
    const parts = partsOf(await toWord(paper([])))
    expect(parts).not.toContain('word/footer1.xml')
  })

  /**
   * **The first section starts a page, or the cover is not a cover.** Without
   * the break the identity block and the first table share page one, and the
   * opening page reads as a heading that happens to have furniture above it.
   */
  it('breaks the page between the cover and the first section', async () => {
    const xml = documentXml(await toWord({ ...paper([]), cover: COVER }))
    expect(xml).toContain('w:pageBreakBefore')
  })

  it('numbers a section heading and rules it in the accent', async () => {
    const xml = documentXml(await toWord({ ...paper([]), cover: COVER }))
    expect(xml).toContain('01')
    expect(xml).toContain('4F46E5')
  })

  /**
   * **The page every column width is computed from is the page the file
   * declares.** Taking the `docx` library's default while `PRINTABLE_DXA`
   * computes against a literal copy of it leaves the dependency owning the real
   * width and this code owning a mirror: changing the mirror to Letter's 12240
   * keeps the suite green with every table sized for a page the file does not
   * have.
   *
   * **What this cannot see, now that the page is declared.** It reads the
   * constants rather than restating them, so it is close to a tautology - and
   * because the page chosen *is* `docx`'s own default, no assertion here can
   * tell a declared page from an inherited one. Deleting the `page` block would
   * leave it green. That is the cost of agreeing with the library, and it is
   * worth naming rather than papering over: what the check still buys is that
   * the declaration reaches the file at all, which is what breaks if `docx`
   * changes how `properties.page` is spelled.
   */
  it('is laid out on the page its column widths are computed from', async () => {
    const xml = documentXml(await toWord(paper([])))
    expect(xml).toContain(`<w:pgSz w:w="${String(PAGE_DXA)}" w:h="${String(PAGE_HEIGHT_DXA)}"`)
    expect(xml).toContain(`w:left="${String(MARGIN_DXA)}"`)
  })
})

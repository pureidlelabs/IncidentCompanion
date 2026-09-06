/**
 * The table header row, asserted where it ships.
 *
 * **`palette.test.ts` pins the constants and that is not the same claim.** It
 * proves `TABLE_HEADER` reads against `ZEBRA`; it says nothing about either
 * painter *using* it, so a ground at 1.08:1 against the body's own stripe can
 * be reinstated in both painters with that file green.
 *
 * So these read the artefact rather than the palette: the pdfmake definition
 * and the `word/document.xml` inside the `.docx`.
 */
import { describe, expect, it } from 'vitest'

import { definitionFor } from './pdf.js'
import { toWord } from './word.js'
import { TABLE_HEADER, TABLE_HEADER_INK, ZEBRA } from './palette.js'
import type { Document, Node } from './model.js'

const TABLE: Node = {
  type: 'table',
  header: ['Phase', 'Touched'],
  rows: [
    [{ text: 'initial access' }, { text: 'WKS-01' }],
    [{ text: 'execution' }, { text: 'WKS-02' }],
  ],
  widths: [0.3, 0.7],
}

const paper = (nodes: Node[]): Document => ({
  title: 'CASE-1',
  tlp: '',
  language: 'en',
  languageCoverage: 1,
  sections: [{ blockId: 'b', kind: 'killchain', heading: 'Kill chain', nodes }],
})

/** OOXML spells a hex bare and upper-case. */
const bare = (hex: string): string => hex.replace('#', '').toUpperCase()

describe('a table header', () => {
  it('is painted on the palette ground, with the palette ink, in the PDF', () => {
    const found = JSON.stringify(definitionFor(paper([TABLE])))
    expect(found).toContain(TABLE_HEADER)
    expect(found).toContain(TABLE_HEADER_INK)
    // The grey no reader can tell from the zebra stripe, named so the refusal
    // reads as an assertion rather than as an arbitrary hex.
    expect(found).not.toContain('#efefef')
  })

  it('is painted on the palette ground, with the palette ink, in Word', async () => {
    const file = await toWord(paper([TABLE]))
    const { default: JSZip } = await import('jszip')
    const xml = await (await JSZip.loadAsync(file)).file('word/document.xml')!.async('string')

    expect(xml).toContain(bare(TABLE_HEADER))
    expect(xml).toContain(bare(TABLE_HEADER_INK))
    expect(xml).not.toContain('EFEFEF')
  })

  /**
   * **The header may not be the stripe.** Both painters take the two grounds
   * from the palette, so the way this regresses is one of them reaching for the
   * wrong token -- which leaves every hex in the file legitimate and only the
   * *pairing* wrong.
   */
  it('does not paint the header in the zebra stripe', async () => {
    expect(JSON.stringify(definitionFor(paper([TABLE])))).not.toContain(
      `"fillColor":"${ZEBRA}","bold":true`,
    )
    const file = await toWord(paper([TABLE]))
    const { default: JSZip } = await import('jszip')
    const xml = await (await JSZip.loadAsync(file)).file('word/document.xml')!.async('string')
    // The header row is the first `w:tr`; the stripe may not be its ground.
    const firstRow = xml.slice(xml.indexOf('<w:tr'), xml.indexOf('</w:tr>'))
    expect(firstRow).toContain(bare(TABLE_HEADER))
    expect(firstRow).not.toContain(bare(ZEBRA))
  })
})

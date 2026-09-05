/**
 * A quotation, through all three painters.
 */
import { describe, expect, it } from 'vitest'

import { definitionFor } from './pdf.js'
import { toMarkdown } from './markdown.js'
import { toWord } from './word.js'
import type { Document, Node } from './model.js'

const paper = (nodes: Node[]): Document => ({
  title: 'CASE-1',
  tlp: '',
  language: 'en',
  languageCoverage: 1,
  sections: [{ blockId: 'b', kind: 'written', heading: 'Summary', nodes }],
})

const QUOTE: Node = {
  type: 'quote',
  runs: [{ text: 'Your files have been ' }, { text: 'encrypted', bold: true }],
}

describe('a quotation', () => {
  it('reaches the markdown as a quote and not as a paragraph', () => {
    const out = toMarkdown(paper([QUOTE]))
    expect(out).toContain('> Your files have been **encrypted**')
  })

  /**
   * **The marker is the whole assertion.** Emitting the words without it is
   * the exact defect: valid markdown, correct text, and the attribution gone.
   */
  it('does not emit the words bare', () => {
    expect(toMarkdown(paper([QUOTE]))).not.toMatch(/^Your files have been/m)
  })

  it('is painted apart from the surrounding prose in the PDF', () => {
    const definition = definitionFor(paper([QUOTE]))
    const found = JSON.stringify(definition)
    // Muted ink is what distinguishes it; a quote painted in body ink at body
    // indent is indistinguishable from the analyst's own sentence.
    expect(found).toContain('#6b7280')
    expect(found).toContain('encrypted')
  })

  /**
   * **Read out of the zip, because "the file is non-empty" is not a claim.**
   */
  it('survives into the .docx as indented, muted text', async () => {
    const file = await toWord(paper([QUOTE]))
    const { default: JSZip } = await import('jszip')
    const xml = await (await JSZip.loadAsync(file)).file('word/document.xml')!.async('string')

    expect(xml).toContain('encrypted')
    // 6B7280 is MUTED, and 360 DXA is the quarter-inch indent. Together they
    // are what separates a quotation from the sentence above it.
    expect(xml).toContain('6B7280')
    expect(xml).toMatch(/w:left="360"/)
  })
})

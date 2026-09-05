/**
 * The translation caveat, and that all three painters print it.
 */
import { constants, inflateRawSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { coverageNote, type Document } from './model.js'
import { toMarkdown } from './markdown.js'
import { toWord } from './word.js'
import { toPdf } from './pdf.js'

/**
 * The text of a `.docx`'s main part.
 */
function documentXml(file: Buffer): string {
  // Local file headers: `PK\x03\x04`, name length at +26, extra at +28.
  for (let at = 0; at < file.length - 4; at += 1) {
    if (file.readUInt32LE(at) !== 0x04034b50) continue
    const nameLength = file.readUInt16LE(at + 26)
    const extraLength = file.readUInt16LE(at + 28)
    if (file.toString('utf8', at + 30, at + 30 + nameLength) !== 'word/document.xml') continue
    const start = at + 30 + nameLength + extraLength
    return inflateRawSync(file.subarray(start), { finishFlush: constants.Z_SYNC_FLUSH }).toString('utf8')
  }
  return ''
}

const paper = (language: string, languageCoverage: number): Document => ({
  title: 'CASE-1',
  tlp: '',
  language,
  languageCoverage,
  sections: [
    {
      blockId: 'b',
      kind: 'written',
      heading: 'Summary',
      nodes: [{ type: 'prose', paras: ['the summary'] }],
    },
  ],
})

describe('the coverage note', () => {
  it('says nothing at all when the pack was complete', () => {
    expect(coverageNote(paper('en', 1))).toBeNull()
    expect(coverageNote(paper('nl', 1))).toBeNull()
  })

  it('names the language and what this install carried', () => {
    // 72 of the 105 English keys, which is the shipped Dutch pack.
    expect(coverageNote(paper('nl', 72 / 105))).toBe(
      'This report is set to Dutch, of which this install carried 68%. ' +
        'The remaining labels print in English.',
    )
  })

  it('never claims 100% for a pack that is not complete', () => {
    // **Rounding is what would.** 0.999 to the nearest whole number is 100,
    // and a note reading "carried 100%" beside "the remaining labels print in
    // English" is a document contradicting itself.
    expect(coverageNote(paper('nl', 0.999))).toContain('carried 99%')
  })

  it('falls back to the code for a language nothing can name', () => {
    // `Intl.DisplayNames` throws on a structurally invalid tag rather than
    // answering; an empty language in the note would read as a bug in the
    // report rather than as an unknown pack.
    expect(coverageNote(paper('not a tag', 0.5))).toContain('set to not a tag,')
  })

  it('is printed by the markdown painter, under the title', () => {
    const painted = toMarkdown(paper('nl', 0.5))
    expect(painted).toContain('This report is set to Dutch')
    // **Before the first section**, so a reader meets the caveat before the
    // mixed-language headings rather than after them.
    expect(painted.indexOf('set to Dutch')).toBeLessThan(painted.indexOf('## Summary'))
  })

  it('is left out of the markdown painter when there is nothing to say', () => {
    expect(toMarkdown(paper('nl', 1))).not.toContain('This report is set to')
  })

  it('reaches the Word file, in the body and not the page header', async () => {
    const xml = documentXml(await toWord(paper('nl', 0.5)))
    expect(xml).toContain('This report is set to Dutch')
    // The marking owns the header part; a caveat about the whole artefact is
    // said once, so it must be in `document.xml` rather than `header1.xml`.
    expect(documentXml(await toWord(paper('nl', 1)))).not.toContain('This report is set to')
  })

  it('reaches the PDF', async () => {
    const partial = await toPdf(paper('nl', 0.5))
    const whole = await toPdf(paper('nl', 1))
    expect(partial.length).toBeGreaterThan(whole.length)
  })
})

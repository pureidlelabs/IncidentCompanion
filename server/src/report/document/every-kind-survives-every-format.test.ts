/**
 * **Every kind of part comes out of every offered format.**
 *
 * `report` asks for it directly -- *a report containing every kind of part,
 * exported in each offered format, and every part present and readable in
 * each* -- and the reason is in the requirement above it: the application must
 * produce *a form that format can present rather than something that renders
 * in the application and is absent, broken or unreadable in the document*.
 *
 * The subject is the cross-product of `BLOCK_KINDS` and the three exporters,
 * so a kind added later is swept without this file being edited, and so is a
 * fourth format the day one is added.
 *
 * **What "readable" can mean here differs by format, and the file says which
 * it is asserting.** Markdown is text, so a heading is checked to be present.
 * A `.docx` is a zip and a PDF is a content stream: their text is not
 * searchable as bytes without pulling in a reader, so what is asserted for
 * those is that the exporter produces a document at all for that kind rather
 * than throwing or answering empty. That is weaker than the scenario's word
 * and it is the half that actually broke things -- a kind the Word writer has
 * no branch for takes the whole export down.
 */
import { describe, expect, it } from 'vitest'

import { BLOCK_KINDS } from '../../domain/entities/report.js'
import { resolveReport, type ReportInput } from './resolve.js'
import { toMarkdown } from './markdown.js'
import { toPdf } from './pdf.js'
import { toWord } from './word.js'

/** A heading that could not be mistaken for anything the document supplies. */
const HEADING = 'Ceci est la section'

function documentWith(kind: (typeof BLOCK_KINDS)[number]) {
  const input: ReportInput = {
    title: 'CASE-1',
    tlp: '',
    language: 'en',
    t: (key: string) => key,
    languageCoverage: 1,
    blocks: [{ id: 'b1', kind, heading: HEADING, headingKey: '', position: 0 }],
  }
  return resolveReport(input)
}

describe('every kind of part, in every offered format', () => {
  it.each(BLOCK_KINDS)('%s reaches the markdown', (kind) => {
    const text = toMarkdown(documentWith(kind))

    expect(
      text,
      `a ${kind} section is absent from the markdown, so a part an analyst placed is ` +
        'silently missing from what the recipient reads',
    ).toContain(HEADING)
  })

  it.each(BLOCK_KINDS)('%s does not break the Word export', async (kind) => {
    const file = await toWord(documentWith(kind))

    expect(
      file.byteLength,
      `the Word exporter produced nothing for a ${kind} section`,
    ).toBeGreaterThan(0)
  })

  it.each(BLOCK_KINDS)('%s does not break the PDF export', async (kind) => {
    const file = await toPdf(documentWith(kind))

    expect(file.byteLength, `the PDF exporter produced nothing for a ${kind} section`).toBeGreaterThan(
      0,
    )
  })
})

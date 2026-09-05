/**
 * **Every kind of part comes out of every offered format.**
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

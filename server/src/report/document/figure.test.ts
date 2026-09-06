/**
 * The figure block, resolved and painted.
 *
 * **Every case here is a way to lose an analyst's illustration silently.** The
 * block is the only one whose subject is a row in another table and a file in
 * another store, so it has four ways to come up empty - and each has to reach
 * the page as a caption saying which, because a figure that simply vanishes
 * leaves a document that reads as complete and is not.
 */
import { describe, expect, it } from 'vitest'

import { figure } from './figure.js'
import { definitionFor, toPdf } from './pdf.js'
import { toWord } from './word.js'
import { toMarkdown } from './markdown.js'
import { defangDocument } from './defang.js'
import { english } from './packs.js'
import type { Document, FigureNode, Images, Node } from './model.js'
import type { ReportBlock, ReportInput } from './resolve.js'
import type { CaseData } from './sections.js'

const ROW = {
  id: 'ev-1',
  name: 'workstation.png',
  location: 'WKS-01',
  hash: 'a'.repeat(64),
}

function input(evidence: unknown[]): ReportInput {
  return {
    title: 'Under test',
    tlp: '',
    language: 'en',
    t: english(),
    languageCoverage: 1,
    blocks: [],
    caseData: { id: 'c-1', title: 'Under test', evidence } as unknown as CaseData,
  }
}

const block = (evidenceId?: string | null): ReportBlock => ({
  id: 'b-1',
  kind: 'figure',
  heading: '',
  headingKey: 'heading.figure',
  position: 0,
  evidenceId,
})

const only = (nodes: Node[]): FigureNode => {
  const found = nodes.find((one): one is FigureNode => one.type === 'figure')
  if (!found) throw new Error(`no figure: ${nodes.map((one) => one.type).join(', ')}`)
  return found
}

const paper = (nodes: Node[]): Document => ({
  title: 'CASE-1',
  tlp: '',
  language: 'en',
  languageCoverage: 1,
  sections: [{ blockId: 'b', kind: 'figure', heading: 'Figure', nodes }],
})

describe('resolving a figure', () => {
  it('names the evidence record and the head of its digest', () => {
    const node = only(figure(input([ROW]), block(ROW.id)))
    expect(node.caption).toBe(`workstation.png \u00b7 ${'a'.repeat(12)}`)
    expect(node.hash).toBe(ROW.hash)
    expect(node.note).toBeUndefined()
  })

  it('falls back to the location and then the id for an unnamed record', () => {
    expect(only(figure(input([{ ...ROW, name: '' }]), block(ROW.id))).caption).toContain('WKS-01')
    expect(
      only(figure(input([{ ...ROW, name: '', location: '' }]), block(ROW.id))).caption,
    ).toContain('ev-1')
  })

  it('says so when the block names no evidence at all', () => {
    const node = only(figure(input([ROW]), block(null)))
    expect(node.caption).toContain('No image chosen')
    expect(node.hash).toBeUndefined()
  })

  it('says so when the record is no longer in the case', () => {
    expect(only(figure(input([]), block('ev-gone'))).caption).toContain('no longer in the case')
  })

  it('draws the caption and a note when the record carries no artefact', () => {
    const node = only(figure(input([{ ...ROW, hash: '' }]), block(ROW.id)))
    expect(node.caption).toContain('workstation.png')
    expect(node.note).toContain('does not hold the image')
    expect(node.hash).toBeUndefined()
  })

  it('never resolves to a size, because measuring is not this layer s job', () => {
    const node = only(figure(input([ROW]), block(ROW.id)))
    expect([node.widthPt, node.heightPt]).toEqual([0, 0])
  })
})

describe('painting a figure', () => {
  const PLACED: Node = {
    type: 'figure',
    caption: 'workstation.png \u00b7 aaaaaaaaaaaa',
    hash: ROW.hash,
    widthPt: 200,
    heightPt: 120,
  }

  /** A one-pixel PNG: enough to be embedded, small enough to read about. */
  const PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const images: Images = new Map([[ROW.hash, PIXEL]])

  /**
   * **Rendered, not inspected.** A definition carries
   * `data:image/png;base64,` for *any* bytes, whatever format they really are,
   * so an assertion on the definition stays green while pdfmake refuses a
   * mislabelled image and takes the whole report's PDF and page index down with
   * it. Producing the file is the only thing that can see that.
   */
  it('renders a real PDF with the image and the caption in it', async () => {
    const file = await toPdf(paper([PLACED]), images)
    expect(file.length).toBeGreaterThan(0)
    // **`/Subtype /Image`, not `/Image`.** The shorter string appears in a PDF
    // holding no image at all, so an assertion on it passes against an empty
    // map and reads as coverage.
    expect(file.toString('latin1')).toContain('/Subtype /Image')
    expect(JSON.stringify(definitionFor(paper([PLACED]), images))).toContain('workstation.png')
  }, 30_000)

  /**
   * **The caption survives when the image does not.** This is the whole
   * degradation contract: an install that no longer holds the artefact still
   * prints what the analyst placed and why it is not there.
   */
  it('prints the caption alone when this install holds no bytes', () => {
    const found = JSON.stringify(definitionFor(paper([{ ...PLACED, note: 'gone' }]), new Map()))
    expect(found).not.toContain('data:image/png;base64,')
    expect(found).toContain('workstation.png')
    expect(found).toContain('gone')
  })

  it('embeds the image in the .docx as a media part', async () => {
    const file = await toWord(paper([PLACED]), images)
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(file)
    expect(Object.keys(zip.files).filter((name) => name.startsWith('word/media/')).length)
      .toBeGreaterThan(0)
    expect(await zip.file('word/document.xml')!.async('string')).toContain('workstation.png')
  })

  /**
   * **The archive carries the caption and the digest, never the bytes.** A
   * base64 data URI makes a `.md` unreadable and undiffable for a picture
   * already sitting in the evidence store beside it.
   */
  it('writes no image into the markdown', () => {
    const out = toMarkdown(paper([PLACED]))
    expect(out).toContain('workstation.png')
    expect(out).not.toContain('base64')
    expect(out).not.toContain('data:image')
  })
})

describe('defanging a figure', () => {
  it('brackets an address in the caption and leaves a filename alone', () => {
    const document_ = defangDocument({
      ...paper([
        { type: 'figure', caption: 'seen at https://evil.example/x', widthPt: 0, heightPt: 0 },
        { type: 'figure', caption: 'payload.zip', widthPt: 0, heightPt: 0 },
      ]),
      sections: [
        {
          blockId: 'b',
          // A generated kind: `written` sections are returned whole by the pass.
          kind: 'figure',
          heading: 'Figure',
          nodes: [
            { type: 'figure', caption: 'seen at https://evil.example/x', widthPt: 0, heightPt: 0 },
            { type: 'figure', caption: 'payload.zip', widthPt: 0, heightPt: 0 },
          ],
        },
      ],
    })
    const captions = document_.sections[0]!.nodes
      .filter((one): one is FigureNode => one.type === 'figure')
      .map((one) => one.caption)

    expect(captions[0]).toContain('hxxps')
    expect(captions[1]).toBe('payload.zip')
  })
})

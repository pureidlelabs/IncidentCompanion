/**
 * Every image format an analyst can attach, through a real render.
 *
 * **The defect this exists for took out a whole report, not a section.** The
 * painters embed a figure as PNG - the PDF writes `data:image/png;base64,`
 * literally - while the render service accepted anything sharp could *measure*.
 * pdfmake refuses a mislabelled image, so one `.webp` screenshot placed as a
 * figure threw from `toPdf` **and** from `pageRuler`, killing the delivered PDF
 * and the editor's page index together, with nothing naming the section.
 *
 * **Reachable from the app's own picker**, which offers png, jpg, jpeg, gif and
 * webp. Two of those five were fatal.
 *
 * **What this file proves, precisely.** It measures which formats the two
 * painters accept - not that the product normalises. The normalisation is the
 * render service's, and deleting it leaves every case here green; the guard on
 * it is the PNG-signature assertion in `figure-render.test.ts`, which drives
 * the service against a real store. Read the two together.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { afterAll, describe, expect, it } from 'vitest'

import { EvidenceStore } from '../evidence/store.js'
import { toPdf, pageRuler } from './document/pdf.js'
import { toWord } from './document/word.js'
import type { Document, Images, Node } from './document/model.js'

const HASH = 'a'.repeat(64)

const root = mkdtempSync(join(tmpdir(), 'ic-figure-formats-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const store = new EvidenceStore({
  get: () => root,
} as unknown as ConstructorParameters<typeof EvidenceStore>[0])

/** The formats the picker offers, plus two it does not and the API allows. */
const FORMATS = ['png', 'jpeg', 'webp', 'gif', 'tiff'] as const

async function bytesOf(format: (typeof FORMATS)[number]): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  const canvas = sharp({
    create: { width: 400, height: 300, channels: 3, background: '#4f46e5' },
  })
  if (format === 'png') return canvas.png().toBuffer()
  if (format === 'jpeg') return canvas.jpeg().toBuffer()
  if (format === 'webp') return canvas.webp().toBuffer()
  if (format === 'gif') return canvas.gif().toBuffer()
  return canvas.tiff().toBuffer()
}

const paper = (nodes: Node[]): Document => ({
  title: 'CASE-1',
  tlp: '',
  language: 'en',
  languageCoverage: 1,
  sections: [{ blockId: 'b', kind: 'figure', heading: 'Figure', nodes }],
})

/**
 * What a painter is handed, as bytes only.
 *
 * **This re-implements the normalisation and therefore proves nothing about
 * the product** - deleting the real one from `render.service.ts` left every
 * case in this file green. What the file *is* honest about is the painters'
 * tolerance: which formats pdfmake and `docx` accept, which is the fact the
 * normalisation exists because of. The branch's own behaviour is asserted in
 * `figure-render.test.ts`, which drives the service.
 */
async function asPng(bytes: Buffer): Promise<Images> {
  const { default: sharp } = await import('sharp')
  return new Map([[HASH, await sharp(bytes).png().toBuffer()]])
}

describe('a figure in any format the analyst can attach', () => {
  it.each(FORMATS)('renders a real PDF from a %s attachment', async (format) => {
    const node: Node = {
      type: 'figure',
      caption: `shot.${format}`,
      hash: HASH,
      widthPt: 200,
      heightPt: 150,
    }
    const images = await asPng(await bytesOf(format))

    // Both, because they are the two routes that lay the document out and the
    // defect killed them together.
    const file = await toPdf(paper([node]), images)
    expect(file.length).toBeGreaterThan(0)
    expect((await pageRuler(paper([node]), images)).pages).toBeGreaterThan(0)
  }, 60_000)

  it.each(FORMATS)('renders a .docx from a %s attachment', async (format) => {
    const node: Node = {
      type: 'figure',
      caption: `shot.${format}`,
      hash: HASH,
      widthPt: 200,
      heightPt: 150,
    }
    const file = await toWord(paper([node]), await asPng(await bytesOf(format)))
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(file)
    expect(Object.keys(zip.files).filter((name) => name.startsWith('word/media/')).length)
      .toBeGreaterThan(0)
  }, 60_000)

  /**
   * **The raw bytes are what the painters cannot take**, which is the half that
   * proves the normalisation is doing the work rather than sharp being
   * incidentally involved. Without it, `webp` and `gif` throw `Unknown image
   * format` here.
   */
  it('refuses the raw bytes of a format the painter does not know', async () => {
    const node: Node = {
      type: 'figure',
      caption: 'shot.webp',
      hash: HASH,
      widthPt: 200,
      heightPt: 150,
    }
    const raw: Images = new Map([[HASH, await bytesOf('webp')]])
    await expect(toPdf(paper([node]), raw)).rejects.toThrow()
  }, 30_000)

  /**
   * The store round trip, so the format sweep above is not asserting about
   * bytes that never went through the content-addressed store an artefact
   * actually arrives by.
   */
  it('reads back what it stored, for the store the render service uses', async () => {
    const bytes = await bytesOf('png')
    const stored = await store.put(Readable.from([bytes]) as never, 'shot.png')
    expect(await store.read(stored.hash)).toEqual(new Uint8Array(bytes))
  }, 30_000)
})

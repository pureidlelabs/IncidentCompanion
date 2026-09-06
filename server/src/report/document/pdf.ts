/**
 * The PDF painter: the document, laid out and paginated.
 *
 * Resolves no data and decides no content - the columns, the heading tiers and
 * the empty states are settled in the document, so a section cannot say one
 * thing in Word and another in the PDF. What is decided here is only how a page
 * expresses it.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import type { CanvasElement, Content, TDocumentDefinitions } from 'pdfmake/interfaces.js'

import { coverageNote, type Cell, type Cover, type Document, type Images, type ListItem, type Node, type Run, type Section, type SpineNode, type TableNode } from './model.js'
import {
  ACCENT,
  INK,
  MUTED,
  PAPER,
  RULE,
  TABLE_HEADER,
  TABLE_HEADER_INK,
  TLP_GROUND,
  ZEBRA,
  chipColours,
  tlpInk,
} from './palette.js'
import { spineGeometry } from './spine.js'

const require_ = createRequire(__filename)

interface PdfMake {
  setFonts(fonts: Record<string, Record<string, string>>): void
  setUrlAccessPolicy(allow: (url: string) => boolean): void
  setLocalAccessPolicy(allow: (path: string) => boolean): void
  createPdf(definition: TDocumentDefinitions): { getBuffer(): Promise<Buffer> }
}

const pdfMake = require_('pdfmake') as PdfMake

let ready = false

function prepare(): void {
  if (ready) return
  const root = join(dirname(require_.resolve('pdfmake/package.json')), 'fonts', 'Roboto')
  pdfMake.setFonts({
    Roboto: {
      normal: join(root, 'Roboto-Regular.ttf'),
      bold: join(root, 'Roboto-Medium.ttf'),
      italics: join(root, 'Roboto-Italic.ttf'),
      bolditalics: join(root, 'Roboto-MediumItalic.ttf'),
    },
  })

  // Nothing outbound, ever, and the only local read is the bundled font
  // directory: the definitions this painter builds name no other file.
  pdfMake.setUrlAccessPolicy(() => false)
  pdfMake.setLocalAccessPolicy((path) => path.includes('pdfmake'))
  ready = true
}


const PAGE = 'A4' as const
const PAGE_WIDTH_PT: Record<typeof PAGE, number> = { A4: 595.28 }
const PAGE_PT = PAGE_WIDTH_PT[PAGE]
const MARGIN_X = 40

/**
 * The printable width, derived from the page and the margins.
 *
 * The spine is laid out against it before pdfmake sees the definition, and the
 * section rules and the dividers draw to it, so it may not be a literal.
 */
export const CONTENT_PT = PAGE_PT - MARGIN_X * 2

function runs(from: Run[]): Content[] {
  const out: Content[] = []
  for (const one of from) {
    out.push({
      text: one.text,
      bold: one.bold ?? false,
      italics: one.italic ?? false,
      ...(one.code ? { font: 'Roboto', fontSize: 9 } : {}),
    })
    if (one.url && one.url !== one.text) out.push({ text: ` (${one.url})`, italics: true })
  }
  return out
}

/**
 * A chip: a pill the width of its own text, not a filled cell.
 *
 * Drawn as a nested single-cell table, so it may be placed anywhere a `Content`
 * goes.
 */
function chip(text: string, fill: string, ink: string): Content {
  return {
    table: {
      widths: ['auto'],
      body: [[{ text, color: ink, fillColor: fill, bold: true, fontSize: 9, margin: [4, 1, 4, 1] }]],
    },
    layout: 'noBorders',
  }
}

function chipFor(one: Cell): Content | null {
  if (one.tlp) return chip(one.text, TLP_GROUND, tlpInk(one.text))
  if (one.chip) {
    const { fill, ink } = chipColours(one.chip.kind, one.chip.value)
    return chip(one.text, fill, ink)
  }
  return null
}

function cell(one: Cell, striped: boolean): Content {
  const fill = one.fill ?? (striped ? ZEBRA : undefined)
  const pill = chipFor(one)
  // **A chip keeps the row's ground and drops the zebra**, or the pill sits in
  // a striped box that reads as a second, larger chip around it.
  if (pill) return { stack: [pill], ...(one.fill ? { fillColor: one.fill } : {}) }
  return {
    text: one.text,
    bold: one.bold ?? one.kvLabel ?? false,
    alignment: one.align ?? 'left',
    ...(one.ink && one.ink.startsWith('#') ? { color: one.ink } : {}),
    ...(fill ? { fillColor: fill } : {}),
    ...(one.mono ? { fontSize: 9 } : {}),
  }
}

/**
 * The kill chain, drawn as vector marks with a `columns` row per label row.
 *
 * Laid out by `spineGeometry` against this page's content column - the same
 * geometry the Word painter rasterises - so the two are proportionally one
 * drawing rather than the same pixels. Nothing is positioned absolutely, which
 * the page ruler depends on.
 */
function spine(node: SpineNode): Content[] {
  const geometry = spineGeometry(node.phases, CONTENT_PT)
  const { lineY, radius, marks } = geometry

  const canvas: CanvasElement[] = []
  if (marks.length > 1) {
    canvas.push({
      type: 'line',
      x1: marks[0]!.x,
      y1: lineY,
      x2: marks[marks.length - 1]!.x,
      y2: lineY,
      lineWidth: 1.5,
      lineColor: RULE,
    })
  }
  for (const mark of marks) {
    canvas.push({
      type: 'polyline',
      closePath: true,
      color: mark.fill,
      points: [
        { x: mark.x, y: lineY - radius },
        { x: mark.x + radius, y: lineY },
        { x: mark.x, y: lineY + radius },
        { x: mark.x - radius, y: lineY },
      ],
    })
  }

  /**
   * One row of labels, in the boxes the geometry laid out.
   *
   * Each column is given the box's width and the raw label, never a pre-broken
   * one. The boxes tile the row, so the widths sum to the content column and no
   * spacer is needed. -> `spine.ts`
   */
  const labels = (row: 0 | 1): Content => {
    const here = marks.filter((mark) => mark.row === row)
    return {
      columns: here.map((mark) => ({
        text: mark.label,
        alignment:
          mark.anchor === 'start' ? ('left' as const)
          : mark.anchor === 'end' ? ('right' as const)
          : ('center' as const),
        fontSize: geometry.labelSize,
        color: MUTED,
        width: mark.boxWidth,
      })),
      columnGap: 0,
      margin: [0, row === 0 ? 2 : 0, 0, row === 0 && geometry.staggered ? 0 : 4],
    }
  }

  return [
    { canvas, margin: [0, 4, 0, 0] },
    labels(0),
    ...(geometry.staggered ? [labels(1)] : []),
    { text: node.foot, fontSize: 8, color: MUTED, margin: [0, 2, 0, 6] },
  ]
}

function table(node: TableNode): Content {
  const body: Content[][] = []

  if (node.header) {
    body.push(
      node.header.map((text) => ({
        text,
        bold: true,
        color: TABLE_HEADER_INK,
        fillColor: TABLE_HEADER,
      })),
    )
  }
  node.rows.forEach((row, at) => {
    const striped = (node.zebra ?? true) && at % 2 === 1
    body.push(row.map((one) => cell(one, striped && !one.fill)))
  })

  if (body.length === 0) return { text: '' }

  return {
    table: {
      headerRows: node.header ? 1 : 0,
      dontBreakRows: true,
      widths: node.widths.map((share) => `${String(Math.round(share * 100))}%`),
      body,
    },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 8],
  }
}

function list(items: ListItem[]): Content[] {
  const counters = new Map<number, number>()
  let previous = 0

  return items.map((item) => {
    if (item.level < previous) {
      for (const level of [...counters.keys()]) if (level > item.level) counters.delete(level)
    }
    previous = item.level

    let marker = '\u2022 '
    if (item.ordered) {
      const next = (counters.get(item.level) ?? 0) + 1
      counters.set(item.level, next)
      marker = `${String(next)}. `
    } else {
      counters.delete(item.level)
    }

    return { text: [{ text: marker }, ...runs(item.runs)], margin: [12 * (item.level + 1), 1, 0, 1] }
  })
}

function node(one: Node, images: Images): Content[] {
  switch (one.type) {
    case 'richPara':
      return [{ text: runs(one.runs), margin: [0, 2, 0, 4] }]
    case 'prose':
      return one.paras.map((text) => ({ text, margin: [0, 2, 0, 4] }))
    case 'subtitle':
      return [{ text: one.text, style: 'title' }]
    case 'subhead':
      return [{ text: one.text, style: 'subhead' }]
    case 'minorHead':
      return [{ text: one.text, style: 'minorHead' }]
    case 'list':
      return list(one.items)
    case 'code':
      return [{ text: one.lines.join('\n'), fontSize: 9, margin: [0, 2, 0, 6] }]
    // Indented to the list's first level and muted, never a vertical rule:
    // that needs a canvas behind a block whose height only the engine knows.
    case 'quote':
      return [{ text: runs(one.runs), color: MUTED, margin: [12, 2, 0, 4] }]
    case 'spine':
      return spine(one)
    case 'figure': {
      const bytes = one.hash ? images.get(one.hash) : undefined
      const out: Content[] = []
      if (bytes && one.widthPt > 0) {
        out.push({
          // pdfmake takes a data URI or a file path; the bytes never touch
          // disk here, and the local access policy would refuse them if they
          // did.
          image: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,
          width: one.widthPt,
          height: one.heightPt,
          margin: [0, 4, 0, 2],
        })
      }
      out.push({ text: one.caption, fontSize: 8, color: MUTED, margin: [0, 0, 0, 2] })
      if (one.note) out.push({ text: one.note, fontSize: 8, italics: true, color: MUTED, margin: [0, 0, 0, 6] })
      return out
    }
    case 'divider':
      return [
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_PT, y2: 0, lineWidth: 0.5, lineColor: RULE }],
          margin: [0, 6, 0, 6],
        },
      ]
    case 'table':
      return [table(one)]
  }
}

/**
 * A numbered heading and the accent rule under it.
 *
 * The number is the section's position in the document, so the painter owns it
 * rather than the model - the same split as list numbering.
 */
function heading(text: string, number: number): Content[] {
  return [
    {
      text: [
        { text: `${String(number).padStart(2, '0')}  `, color: ACCENT, bold: true },
        { text, color: INK },
      ],
      style: 'heading',
      // Or the heading lands as the last line of a page with its table
      // overleaf, which is routine once a section can carry several.
      headlineLevel: 1,
    },
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_PT, y2: 0, lineWidth: 1, lineColor: ACCENT }],
      margin: [0, 0, 0, 6],
    },
  ]
}

function section(one: Section, id: string | undefined, number: number, images: Images): Content[] {
  const out: Content[] = []
  if (one.heading) out.push(...heading(one.heading, number))
  for (const child of one.nodes) out.push(...node(child, images))

  // Stamped on every render, not only the ruler's: `id` is inert to layout, so
  // one definition serves both and the ruler cannot describe another pagination.
  const first = out[0]
  if (id && first && typeof first === 'object') {
    ;(first as { id?: string }).id = id
  }
  return out
}

const sectionId = (at: number): string => `section-${String(at)}`

/**
 * The opening page: a dark band, then the facts, then a page break.
 *
 * The band's ground is a single-cell table so it grows with the headline, and
 * the facts are a borderless two-column table so the values align down the page
 * and a chip sits on its value's baseline.
 */
function cover(one: Cover): Content[] {
  return [
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              fillColor: INK,
              margin: [18, 18, 18, 18],
              stack: [
                { text: one.eyebrow, color: MUTED, fontSize: 8, characterSpacing: 1, margin: [0, 0, 0, 8] },
                { text: one.title, color: PAPER, fontSize: 22, bold: true, lineHeight: 1.15 },
                ...(one.subtitle
                  ? [{ text: one.subtitle, color: MUTED, fontSize: 10, margin: [0, 8, 0, 0] as [number, number, number, number] }]
                  : []),
              ],
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 10, 0, 24],
    },
    {
      table: {
        widths: ['30%', '70%'],
        body: one.rows.map((row) => [
          { text: row.label.toUpperCase(), color: MUTED, fontSize: 9, characterSpacing: 0.5, margin: [0, 4, 0, 4] },
          { ...(cell(row.value, false) as object), margin: [0, 4, 0, 4] } as Content,
        ]),
      },
      layout: 'noBorders',
    },
    // **The cover is a page.** Whatever follows starts on a fresh one, or the
    // first section runs on under the identity block and the page stops being
    // a cover at all.
    { text: '', pageBreak: 'after' },
  ]
}

/**
 * Exported for the painter's own tests, which cannot see a compressed page.
 *
 * **Not part of the painting path's contract**: both entry points build from
 * here, and a test reading this proves the painter *asked* for a banner, a
 * numbered heading or a pill. Whether pdfmake drew it is a render's question.
 */
export function definitionFor(document_: Document, images: Images = new Map()): TDocumentDefinitions {
  const note = coverageNote(document_)
  return {
    info: { title: document_.title },
    pageSize: PAGE,
    pageMargins: [MARGIN_X, document_.tlp ? 56 : 40, MARGIN_X, 48],
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.25 },
    styles: {
      title: { fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
      heading: { fontSize: 14, bold: true, margin: [0, 12, 0, 6] },
      subhead: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
      minorHead: { fontSize: 11, bold: true, margin: [0, 6, 0, 3] },
    },
    // A band across the top of every page, in the marking's own colours, and a
    // table so the ground is full width rather than the width of the words.
    ...(document_.tlp
      ? {
          header: () => ({
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    text: document_.tlp,
                    color: tlpInk(document_.tlp),
                    fillColor: TLP_GROUND,
                    bold: true,
                    fontSize: 9,
                    alignment: 'center',
                    margin: [0, 4, 0, 4],
                  },
                ],
              ],
            },
            layout: 'noBorders',
            margin: [0, 12, 0, 0],
          }),
        }
      : {}),
    footer: (page: number, pages: number) => ({
      columns: [
        { text: document_.tlp, bold: true, color: INK, width: '25%' },
        { text: document_.title, alignment: 'center', color: MUTED, width: '50%' },
        { text: `${String(page)} / ${String(pages)}`, alignment: 'right', color: MUTED, width: '25%' },
      ],
      fontSize: 8,
      margin: [40, 16, 40, 0],
    }),
    content: [
      ...(document_.cover ? cover(document_.cover) : [{ text: document_.title, style: 'title' }]),
      // The coverage note goes in the content, under the title, and carries no
      // `id`, so the page ruler - which keys on `sectionId` - does not see it.
      ...(note
        ? [{ text: note, italics: true, fontSize: 8, margin: [0, 0, 0, 10] as [number, number, number, number] }]
        : []),
      ...document_.sections.flatMap((one, at) => section(one, sectionId(at), at + 1, images)),
    ],
  }
}

/**
 * The whole document as a PDF buffer.
 *
 * **The marking is on every page and so is the page number.** A handling
 * instruction the reader sees once is not one, and a printed page that leaves
 * the building carries no scroll position - which is the same argument the Word
 * painter's page header makes.
 */
export async function toPdf(document_: Document, images: Images = new Map()): Promise<Buffer> {
  prepare()
  return pdfMake.createPdf(definitionFor(document_, images)).getBuffer()
}

export interface PageRuler {
  pages: number
  sections: { index: number; heading: string; page: number }[]
}

/**
 * The page each section starts on.
 *
 * Renders the whole document to answer, because pagination depends on every
 * preceding section's height and nothing cheaper knows it. The `pageBreakBefore`
 * callback never asks for a break: returning true would change the pagination it
 * is measuring.
 */
export async function pageRuler(document_: Document, images: Images = new Map()): Promise<PageRuler> {
  prepare()

  const startedOn = new Map<string, number>()
  let pages = 0

  const definition: TDocumentDefinitions = {
    ...definitionFor(document_, images),
    pageBreakBefore: (current: {
      id?: string
      pages?: number
      pageNumbers?: number[]
    }) => {
      if (typeof current.pages === 'number') pages = Math.max(pages, current.pages)
      const first = current.pageNumbers?.[0]
      if (current.id && typeof first === 'number') startedOn.set(current.id, first)
      return false
    },
  }

  await pdfMake.createPdf(definition).getBuffer()

  return {
    // **One page, not zero, for a document with no section at all.** A report
    // holding nothing still renders its title page, and answering 0 reads as
    // the ruler having failed rather than as an empty report.
    pages: Math.max(pages, 1),
    sections: document_.sections.map((one, at) => ({
      index: at,
      heading: one.heading,
      // A section whose first node the layout never reported falls back to
      // page 1 rather than to nothing, so a ruler is always answerable.
      page: startedOn.get(sectionId(at)) ?? 1,
    })),
  }
}

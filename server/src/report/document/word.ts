/**
 * The Word painter: the document, as `.docx`.
 */
import {
  AlignmentType,
  Document as WordDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  ImageRun,
} from 'docx'

import { coverageNote, type Cell, type Cover, type Document, type Images, type ListItem, type Node, type Run, type Section, type SpineNode, type TableNode } from './model.js'
import {
  ACCENT,
  INK,
  MUTED,
  PAPER,
  TABLE_HEADER,
  TABLE_HEADER_INK,
  TLP_GROUND,
  ZEBRA,
  chipColours,
  tlpInk,
} from './palette.js'
import { spineGeometry, spinePng } from './spine.js'

/**
 * A spine's rendered PNG, looked up by the node it belongs to. Threaded through
 * the walk as a parameter and never held in module state.
 */
export type Drawings = Map<SpineNode, { png: Buffer; widthPt: number; heightPt: number }>

/** Every spine in the document, in the order a painter would meet them. */
function spinesIn(document_: Document): SpineNode[] {
  return document_.sections.flatMap((one) =>
    one.nodes.filter((node_): node_ is SpineNode => node_.type === 'spine'),
  )
}

/** A cover's own tables draw no rules; the band and the facts are not grids. */
const NO_BORDERS = {
  top: { style: 'none' as const, size: 0, color: 'auto' },
  bottom: { style: 'none' as const, size: 0, color: 'auto' },
  left: { style: 'none' as const, size: 0, color: 'auto' },
  right: { style: 'none' as const, size: 0, color: 'auto' },
  insideHorizontal: { style: 'none' as const, size: 0, color: 'auto' },
  insideVertical: { style: 'none' as const, size: 0, color: 'auto' },
}

/**
 * A data table's rules: across, never down.
 */
const RULES_ONLY = {
  top: { style: 'single' as const, size: 4, color: 'D9D9D9' },
  bottom: { style: 'single' as const, size: 4, color: 'D9D9D9' },
  left: { style: 'none' as const, size: 0, color: 'auto' },
  right: { style: 'none' as const, size: 0, color: 'auto' },
  insideHorizontal: { style: 'single' as const, size: 4, color: 'D9D9D9' },
  insideVertical: { style: 'none' as const, size: 0, color: 'auto' },
}


/**
 * The page this document declares, in DXA - twentieths of a point, which is
 * what OOXML measures in.
 */
export const PAGE_DXA = 11906
export const PAGE_HEIGHT_DXA = 16838
export const MARGIN_DXA = 1440

/**
 * The printable width: A4 less one-inch margins.
 */
const PRINTABLE_DXA = PAGE_DXA - MARGIN_DXA * 2

/**
 * The same width in points, for anything laid out before OOXML sees it.
 */
export const CONTENT_PT = PRINTABLE_DXA / 20

/**
 * A run, with its emphasis.
 */
function runs(from: Run[], colour?: string): TextRun[] {
  const out: TextRun[] = []
  for (const one of from) {
    out.push(
      new TextRun({
        text: one.text,
        bold: one.bold ?? false,
        italics: one.italic ?? false,
        ...(colour ? { color: bare(colour) } : {}),
        ...(one.code ? { font: 'Consolas' } : {}),
      }),
    )
    if (one.url && one.url !== one.text) {
      out.push(new TextRun({ text: ` (${one.url})`, italics: true }))
    }
  }
  return out
}

/** A hex the model carries as `#rrggbb`, as OOXML wants it. */
const bare = (hex: string): string => hex.replace('#', '').toUpperCase()

/**
 * The runs a cell's text is, as a chip where it asks to be one.
 */
function cellRuns(one: Cell): TextRun[] {
  const pill = one.tlp
    ? { fill: bare(TLP_GROUND), ink: bare(tlpInk(one.text)) }
    : one.chip
      ? (({ fill, ink }) => ({ fill: bare(fill), ink: bare(ink) }))(chipColours(one.chip.kind, one.chip.value))
      : null

  if (pill) {
    return [
      new TextRun({
        // Padded with hair spaces: run shading has no cell padding, so the
        // ground otherwise starts and ends hard against the glyphs.
        text: `\u200a${one.text}\u200a`,
        bold: true,
        color: pill.ink,
        shading: { type: ShadingType.CLEAR, fill: pill.fill },
      }),
    ]
  }

  return [
    new TextRun({
      text: one.text,
      bold: one.bold ?? one.kvLabel ?? false,
      ...(one.ink && one.ink.startsWith('#') ? { color: bare(one.ink) } : {}),
      // **A size with the face.** Consolas at the body size reads larger
      // than the Calibri beside it, so a monospaced cell looked emphasised
      // rather than technical - and the PDF painter already sets 9pt.
      ...(one.mono ? { font: 'Consolas', size: 18 } : {}),
    }),
  ]
}

function cell(one: Cell, striped: boolean, share: number | undefined): TableCell {
  const fill = one.fill ?? (striped ? bare(ZEBRA) : undefined)
  return new TableCell({
    // **Word merges; pdfmake pads.** A pasted merged cell carries its span, and
    // Word draws one cell across it while the covered positions are omitted from
    // the row - the opposite shape from the PDF, which keeps the blank cells.
    ...(one.colSpan && one.colSpan > 1 ? { columnSpan: one.colSpan } : {}),
    ...(one.rowSpan && one.rowSpan > 1 ? { rowSpan: one.rowSpan } : {}),
    ...(share === undefined
      ? {}
      : { width: { size: Math.round(share * PRINTABLE_DXA), type: WidthType.DXA } }),
    ...(fill ? { shading: { type: ShadingType.CLEAR, fill } } : {}),
    children: [
      new Paragraph({
        alignment:
          one.align === 'right'
            ? AlignmentType.RIGHT
            : one.align === 'center'
              ? AlignmentType.CENTER
              : AlignmentType.LEFT,
        children: cellRuns(one),
      }),
    ],
  })
}

/**
 * A table at the model's own column widths - fractions in the model, DXA in
 * the file, and the table has to be *fixed* for either to mean anything.
 */
function table(node: TableNode): Table {
  const rows: TableRow[] = []

  if (node.header) {
    rows.push(
      new TableRow({
        tableHeader: true,
        children: node.header.map(
          (text, at) =>
            new TableCell({
              ...(node.widths[at] === undefined
                ? {}
                : {
                    width: {
                      size: Math.round(node.widths[at] * PRINTABLE_DXA),
                      type: WidthType.DXA,
                    },
                  }),
              shading: { type: ShadingType.CLEAR, fill: bare(TABLE_HEADER) },
              children: [
                new Paragraph({
                  children: [new TextRun({ text, bold: true, color: bare(TABLE_HEADER_INK) })],
                }),
              ],
            }),
        ),
      }),
    )
  }

  // The positions a merge above or to the left covers: Word draws the span from
  // its top-left cell and the covered cells are dropped from the row, where the
  // PDF keeps them blank. Computed from the spans the walker placed.
  const covered = node.rows.map((row) => row.map(() => false))
  node.rows.forEach((row, r) => {
    row.forEach((one, c) => {
      const across = one.colSpan ?? 1
      const down = one.rowSpan ?? 1
      if (across === 1 && down === 1) return
      for (let dr = 0; dr < down; dr += 1) {
        for (let dc = 0; dc < across; dc += 1) {
          if (dr === 0 && dc === 0) continue
          const line = covered[r + dr]
          if (line && c + dc < line.length) line[c + dc] = true
        }
      }
    })
  })

  node.rows.forEach((row, at) => {
    const striped = (node.zebra ?? true) && at % 2 === 1
    const children: TableCell[] = []
    row.forEach((one, column) => {
      if (covered[at]![column]) return
      children.push(cell(one, striped && !one.fill, node.widths[column]))
    })
    rows.push(
      new TableRow({
        // **The same rule the PDF painter states**: a row split over a page
        // break puts a cell under the wrong neighbour, and the result reads as
        // a well-formed table with one value in the wrong place.
        cantSplit: true,
        children,
      }),
    )
  })

  return new Table({
    rows,
    /**
     * **Horizontal rules only, because that is what the PDF draws.**
     */
    borders: RULES_ONLY,
    // **Fixed, or the widths are a suggestion.** Word's default is autofit: it
    // squeezes a column to fit its neighbour's content, and the Event column
    // went to six lines a row while the model asked for 35%.
    layout: TableLayoutType.FIXED,
    width: { size: PRINTABLE_DXA, type: WidthType.DXA },
    columnWidths: node.widths.map((share) => Math.round(share * PRINTABLE_DXA)),
  })
}

/**
 * A list, numbered by the painter.
 */
function list(items: ListItem[]): Paragraph[] {
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

    return new Paragraph({
      indent: { left: 360 * (item.level + 1) },
      children: [new TextRun({ text: marker }), ...runs(item.runs)],
    })
  })
}

function node(one: Node, drawings: Drawings, images: Images): (Paragraph | Table)[] {
  switch (one.type) {
    case 'richPara':
      return [new Paragraph({ children: runs(one.runs) })]
    case 'prose':
      return one.paras.map((text) => new Paragraph({ children: [new TextRun({ text })] }))
    case 'subtitle':
      return [new Paragraph({ text: one.text, heading: HeadingLevel.HEADING_1 })]
    case 'subhead':
      return [new Paragraph({ text: one.text, heading: HeadingLevel.HEADING_3 })]
    case 'minorHead':
      return [new Paragraph({ text: one.text, heading: HeadingLevel.HEADING_4 })]
    case 'list':
      return list(one.items)
    case 'code':
      return one.lines.map(
        (line) => new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas' })] }),
      )
    // Indented and muted, matching the PDF. `indent` is in DXA like every
    // other measure in this painter, so 360 is the quarter inch the list uses.
    case 'quote':
      return [new Paragraph({ indent: { left: 360 }, children: runs(one.runs, MUTED) })]
    /**
     * **The one picture in the document, and it is a picture in Word too.**
     */
    case 'spine': {
      const drawn = drawings.get(one)
      const foot = new Paragraph({
        children: [new TextRun({ text: one.foot, size: 16, color: bare(MUTED) })],
      })
      if (!drawn) {
        return [
          new Paragraph({
            children: [
              new TextRun({ text: one.phases.map((phase) => phase.label).join(' \u203a ') }),
            ],
          }),
          foot,
        ]
      }
      return [
        new Paragraph({
          children: [
            new ImageRun({
              type: 'png',
              data: drawn.png,
              // Points to the half-points-of-a-point Word wants for an image:
              // the geometry is in points and `docx` takes pixels at 96 DPI.
              transformation: {
                width: Math.round((drawn.widthPt * 96) / 72),
                height: Math.round((drawn.heightPt * 96) / 72),
              },
            }),
          ],
        }),
        foot,
      ]
    }
    /**
     * **A picture in Word, which is what the figure block was refused for.**
     */
    case 'figure': {
      const bytes = one.hash ? images.get(one.hash) : undefined
      const out: Paragraph[] = []
      if (bytes && one.widthPt > 0) {
        out.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: Buffer.from(bytes),
                // Points to pixels at 96 DPI, which is what `docx` takes.
                transformation: {
                  width: Math.round((one.widthPt * 96) / 72),
                  height: Math.round((one.heightPt * 96) / 72),
                },
              }),
            ],
          }),
        )
      }
      out.push(new Paragraph({ children: [new TextRun({ text: one.caption, size: 16, color: bare(MUTED) })] }))
      if (one.note) {
        out.push(
          new Paragraph({
            children: [new TextRun({ text: one.note, size: 16, italics: true, color: bare(MUTED) })],
          }),
        )
      }
      return out
    }
    case 'divider':
      return [new Paragraph({ border: { bottom: { style: 'single', size: 6, color: 'CCCCCC' } } })]
    case 'table':
      return [table(one), new Paragraph({ text: '' })]
  }
}

function section(
  one: Section,
  number: number,
  drawings: Drawings,
  images: Images,
  breakBefore = false,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  // A heading only when there is one: an empty `Heading 2` is a blank line
  // that takes a contents-page entry with it.
  if (one.heading) {
    out.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        // Or the heading lands as the last line of a page with its table
        // overleaf, which is routine once a section carries several.
        keepNext: true,
        ...(breakBefore ? { pageBreakBefore: true } : {}),
        border: { bottom: { style: 'single', size: 8, color: bare(ACCENT) } },
        children: [
          // The number is the painter's, like list numbering: it is the
          // section's position in the document rather than a fact about it.
          new TextRun({ text: `${String(number).padStart(2, '0')}  `, color: bare(ACCENT), bold: true }),
          new TextRun({ text: one.heading }),
        ],
      }),
    )
  } else if (breakBefore) {
    // **A section the layout prints unheaded still has to start the page.**
    // Hanging the break on the heading alone loses it exactly when the first
    // block is a written one the analyst titled themselves.
    out.push(new Paragraph({ text: '', pageBreakBefore: true }))
  }
  for (const child of one.nodes) out.push(...node(child, drawings, images))
  return out
}

/**
 * The opening page: a one-cell shaded table for the band, as in the PDF, since
 * a shaded paragraph does not grow around a stack of differently-sized lines.
 */
function cover(one: Cover): (Paragraph | Table)[] {
  const band = new Table({
    width: { size: PRINTABLE_DXA, type: WidthType.DXA },
    columnWidths: [PRINTABLE_DXA],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: PRINTABLE_DXA, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: bare(INK) },
            margins: { top: 240, bottom: 240, left: 240, right: 240 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: one.eyebrow, color: bare(MUTED), size: 16 })],
              }),
              new Paragraph({
                spacing: { before: 120 },
                children: [new TextRun({ text: one.title, color: bare(PAPER), bold: true, size: 44 })],
              }),
              ...(one.subtitle
                ? [
                    new Paragraph({
                      spacing: { before: 120 },
                      children: [new TextRun({ text: one.subtitle, color: bare(MUTED), size: 20 })],
                    }),
                  ]
                : []),
            ],
          }),
        ],
      }),
    ],
  })

  const facts = new Table({
    width: { size: PRINTABLE_DXA, type: WidthType.DXA },
    columnWidths: [Math.round(PRINTABLE_DXA * 0.3), Math.round(PRINTABLE_DXA * 0.7)],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: one.rows.map(
      (row) =>
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: Math.round(PRINTABLE_DXA * 0.3), type: WidthType.DXA },
              children: [
                new Paragraph({
                  spacing: { before: 60, after: 60 },
                  children: [
                    new TextRun({ text: row.label.toUpperCase(), color: bare(MUTED), size: 18 }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: Math.round(PRINTABLE_DXA * 0.7), type: WidthType.DXA },
              children: [
                new Paragraph({ spacing: { before: 60, after: 60 }, children: cellRuns(row.value) }),
              ],
            }),
          ],
        }),
    ),
  })

  return [new Paragraph({ text: '' }), band, new Paragraph({ text: '' }), facts]
}

/**
 * The whole document as a `.docx` buffer.
 */
export async function toWord(document_: Document, images: Images = new Map()): Promise<Buffer> {
  /**
   * **Rasterised before the walk, because the walk cannot await.**
   */
  const spines = spinesIn(document_)
  const rendered = await Promise.all(
    spines.map((one) => spinePng(spineGeometry(one.phases, CONTENT_PT))),
  )
  const drawings: Drawings = new Map()
  spines.forEach((one, at) => {
    const drawn = rendered[at]
    if (drawn) drawings.set(one, drawn)
  })

  // **The marking is in the page header and nowhere else.** It was also the
  // first line of the body, so a Word reader saw it twice on page one while the
  // PDF showed it once - one model, and the painters disagreeing about the
  // document's own front matter.
  const body: (Paragraph | Table)[] = document_.cover
    ? cover(document_.cover)
    : [new Paragraph({ text: document_.title, heading: HeadingLevel.TITLE })]
  /**
   * **Under the title, in the body, and not in the page header.**
   */
  const note = coverageNote(document_)
  if (note) {
    body.push(new Paragraph({ children: [new TextRun({ text: note, italics: true, size: 16 })] }))
  }
  // **The first section starts a page when there is a cover**, or it runs on
  // under the identity block and the opening page stops being a cover.
  document_.sections.forEach((one, at) => {
    body.push(...section(one, at + 1, drawings, images, at === 0 && document_.cover !== undefined))
  })

  const file = new WordDocument({
    /**
     * **The face is declared, not left to the reader.**
     */
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 20 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_DXA, height: PAGE_HEIGHT_DXA },
            margin: {
              top: MARGIN_DXA,
              right: MARGIN_DXA,
              bottom: MARGIN_DXA,
              left: MARGIN_DXA,
            },
          },
        },
        ...(document_.tlp
          ? {
              headers: {
                default: {
                  options: {
                    children: [
                      /**
                       * **The marking's own colours, centred, on black.**
                       */
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        shading: { type: ShadingType.CLEAR, fill: bare(TLP_GROUND) },
                        children: [
                          new TextRun({
                            text: document_.tlp,
                            bold: true,
                            size: 18,
                            color: bare(tlpInk(document_.tlp)),
                          }),
                        ],
                      }),
                    ],
                  },
                },
              },
              /**
               * **And in the footer, in ink rather than in its hue.**
               */
              footers: {
                default: {
                  options: {
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: document_.tlp, bold: true, size: 16 }),
                          new TextRun({ text: `   \u00b7   ${document_.title}`, size: 16, color: bare(MUTED) }),
                        ],
                      }),
                    ],
                  },
                },
              },
            }
          : {}),
        children: body,
      },
    ],
  })

  return Packer.toBuffer(file)
}

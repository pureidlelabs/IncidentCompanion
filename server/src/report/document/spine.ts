/**
 * The kill chain as a path of diamonds on a line - the one visual in this
 * report with real edges.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { MUTED, PAPER, RULE } from './palette.js'

const require_ = createRequire(__filename)

/** One phase the intrusion reached, with the ground its diamond is filled in. */
export interface Phase {
  label: string
  fill: string
}

/**
 * One phase's diamond and the box its label is laid out in.
 */
export interface Mark {
  x: number
  fill: string
  label: string
  /** Wrapped to `boxWidth`. Authoritative for the SVG, a hint for pdfmake. */
  lines: string[]
  /** Where the label's box starts, and how wide it is. They tile the row. */
  boxStart: number
  boxWidth: number
  /**
   * Where the label sits in its box: `middle` centres it on the diamond, and
   * the first and last marks anchor to their edge instead.
   */
  anchor: 'start' | 'middle' | 'end'
  /** 0 unless the drawing is staggered, when alternate labels drop to 1. */
  row: 0 | 1
}

export interface SpineGeometry {
  widthPt: number
  heightPt: number
  /** The vertical the diamonds are centred on. */
  lineY: number
  radius: number
  labelSize: number
  lineHeight: number
  marks: Mark[]
  /** Whether alternate labels were dropped to a second row to fit. */
  staggered: boolean
  /** How many label lines the first row is deep, which is where row 1 starts. */
  firstRowLines: number
}

const RADIUS = 6
const LABEL_PT = 7.5
const LINE_H = 9
/** Space above the diamonds, and between a diamond and its first label line. */
const TOP = 12
const GAP = 9

/**
 * Roboto, from inside pdfmake, opened once - the same file the PDF painter
 * hands to pdfmake, so a label is measured in the face it is drawn in.
 */
interface Glyph {
  path: { scale(x: number, y: number): { translate(x: number, y: number): { toSVG(): string } } }
  advanceWidth: number
}
interface Font {
  unitsPerEm: number
  layout(text: string): { glyphs: Glyph[]; advanceWidth: number }
}

let face: Font | null = null

function roboto(): Font {
  if (face) return face
  const fontkit = require_('fontkit') as { openSync(path: string): Font }
  const root = join(dirname(require_.resolve('pdfmake/package.json')), 'fonts', 'Roboto')
  face = fontkit.openSync(join(root, 'Roboto-Regular.ttf'))
  return face
}

/** A string's width in points at `size`, from the face itself. */
export function widthOf(text: string, size: number): number {
  const font = roboto()
  return (font.layout(text).advanceWidth * size) / font.unitsPerEm
}

/**
 * A label broken to fit its column, at word boundaries only: a word wider than
 * the column is left long rather than chopped.
 */
function wrap(label: string, limit: number): string[] {
  const words = label.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = words[0]!
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`
    if (widthOf(candidate, LABEL_PT) <= limit) line = candidate
    else {
      lines.push(line)
      line = word
    }
  }
  lines.push(line)
  return lines
}

/**
 * Where every part of the drawing goes, at a given content width.
 */
export function spineGeometry(phases: Phase[], widthPt: number): SpineGeometry {
  const count = phases.length
  const column = count > 0 ? widthPt / count : widthPt
  const widest = (lines: string[]): number =>
    lines.reduce((most, line) => Math.max(most, widthOf(line, LABEL_PT)), 0)

  // Staggered - alternate labels dropped to a second row - once any label is
  // wider than its own column. Each row gets its own `columns` row in the PDF.
  const naive = phases.map((phase) => wrap(phase.label, column - 8))
  const staggered = naive.some((lines) => widest(lines) > column - 8)

  // The boxes tile their row: split midway between neighbouring marks on that
  // row, and running out to the drawing's edges at the ends.
  const rowOf = (at: number): 0 | 1 => (staggered && at % 2 === 1 ? 1 : 0)
  const marks: Mark[] = []

  for (const row of [0, 1] as const) {
    const indices = phases.map((_phase, at) => at).filter((at) => rowOf(at) === row)
    if (indices.length === 0) continue

    indices.forEach((at, k) => {
      const x = (at + 0.5) * column
      const previous = k === 0 ? undefined : (indices[k - 1]! + 0.5) * column
      const next = k + 1 === indices.length ? undefined : (indices[k + 1]! + 0.5) * column
      const boxStart = previous === undefined ? 0 : (previous + x) / 2
      const boxEnd = next === undefined ? widthPt : (x + next) / 2
      const boxWidth = boxEnd - boxStart

      // 4pt of air each side, so two boxes' contents never quite meet.
      const lines = wrap(phases[at]!.label, Math.max(boxWidth - 8, 1))
      const half = widest(lines) / 2
      const anchor: Mark['anchor'] =
        x - half < boxStart ? 'start' : x + half > boxEnd ? 'end' : 'middle'

      marks.push({ x, fill: phases[at]!.fill, label: phases[at]!.label, lines, boxStart, boxWidth, anchor, row })
    })
  }

  // Back into drawing order, so a painter walking marks meets them left to right.
  marks.sort((one, other) => one.x - other.x)

  const deepestOf = (row: 0 | 1): number =>
    marks.filter((mark) => mark.row === row).reduce((most, mark) => Math.max(most, mark.lines.length), 0)
  const firstRowLines = Math.max(deepestOf(0), 1)
  const secondRowLines = staggered ? deepestOf(1) : 0

  return {
    widthPt,
    heightPt: TOP + RADIUS * 2 + GAP + (firstRowLines + secondRowLines) * LINE_H,
    lineY: TOP + RADIUS,
    radius: RADIUS,
    labelSize: LABEL_PT,
    lineHeight: LINE_H,
    marks,
    staggered,
    firstRowLines,
  }
}

/**
 * Where one line of a mark's label starts, honouring the anchor.
 */
export function lineLeft(mark: Mark, line: string, size = LABEL_PT): number {
  const width = widthOf(line, size)
  if (mark.anchor === 'start') return mark.boxStart + 4
  if (mark.anchor === 'end') return mark.boxStart + mark.boxWidth - 4 - width
  return mark.x - width / 2
}

/** The leftmost and rightmost points a mark's label reaches. */
export function labelExtent(mark: Mark, size = LABEL_PT): [number, number] {
  let left = Infinity
  let right = -Infinity
  for (const line of mark.lines) {
    const at = lineLeft(mark, line, size)
    left = Math.min(left, at)
    right = Math.max(right, at + widthOf(line, size))
  }
  return [left, right]
}

/** The four points of a diamond centred on `(x, y)`, as an SVG path. */
function diamond(x: number, y: number, r: number): string {
  return `M ${String(x)} ${String(y - r)} L ${String(x + r)} ${String(y)} L ${String(x)} ${String(y + r)} L ${String(x - r)} ${String(y)} Z`
}

/** One label line as glyph outlines, laid out from `left`. */
function outline(text: string, left: number, y: number): string {
  const font = roboto()
  const run = font.layout(text)
  const scale = LABEL_PT / font.unitsPerEm
  let at = left
  let data = ''
  for (const glyph of run.glyphs) {
    // Negated on y because a font's outlines run up from the baseline and SVG
    // user space runs down.
    data += `${glyph.path.scale(scale, -scale).translate(at, y).toSVG()} `
    at += glyph.advanceWidth * scale
  }
  return data.trim()
}

/**
 * The drawing as SVG, for the rasteriser only, on a white ground rather than
 * transparency.
 */
export function spineSvg(geometry: SpineGeometry): string {
  const { widthPt, heightPt, lineY, radius, marks } = geometry
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(widthPt)}" height="${String(heightPt)}" viewBox="0 0 ${String(widthPt)} ${String(heightPt)}">`,
    `<rect width="${String(widthPt)}" height="${String(heightPt)}" fill="${PAPER}"/>`,
  ]

  if (marks.length > 1) {
    const first = marks[0]!.x
    const last = marks[marks.length - 1]!.x
    parts.push(
      `<line x1="${String(first)}" y1="${String(lineY)}" x2="${String(last)}" y2="${String(lineY)}" stroke="${RULE}" stroke-width="1.5"/>`,
    )
  }

  for (const mark of marks) {
    parts.push(`<path d="${diamond(mark.x, lineY, radius)}" fill="${mark.fill}"/>`)
    // A staggered mark's label starts below the whole of the first row, so the
    // two rows cannot meet however deep either of them wraps.
    const top = lineY + radius + GAP + (mark.row === 1 ? geometry.firstRowLines * LINE_H : 0)
    mark.lines.forEach((line, at) => {
      parts.push(
        `<path d="${outline(line, lineLeft(mark, line), top + at * LINE_H)}" fill="${MUTED}"/>`,
      )
    })
  }

  parts.push('</svg>')
  return parts.join('')
}

/**
 * The drawing as PNG bytes, or `null` if the rasteriser refused - never a
 * throw, so the caller can draw the phases a plainer way.
 */
export async function spinePng(
  geometry: SpineGeometry,
  scale = 6,
): Promise<{ png: Buffer; widthPt: number; heightPt: number } | null> {
  try {
    const { default: sharp } = await import('sharp')
    const png = await sharp(Buffer.from(spineSvg(geometry)), {
      density: 72 * scale,
    })
      .png()
      .toBuffer()
    return { png, widthPt: geometry.widthPt, heightPt: geometry.heightPt }
  } catch {
    return null
  }
}

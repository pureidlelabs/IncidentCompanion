/**
 * The stat strip and the chip band: two shapes four sections all wanted.
 *
 * A strip is a wrapping row of figures, a label over a value: the case header,
 * the executive card and the response metrics are all one. A band is a run of
 * coloured cells - the kill-chain path, the technique ids - which is the same
 * table with one row and no labels.
 *
 * `STRIP_COLS` is three, and it is a defect boundary rather than a taste
 * setting: neither painter can be asked how wide a word will be, so the column
 * count is the only thing holding a value inside its cell.
 */
import type { Cell, Node, TableNode } from './model.js'
import { INK, MUTED } from './palette.js'

/** Three. Widening this chops values rather than wrapping them. */
export const STRIP_COLS = 3

/** Rows of `size`, the last one short. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size))
  return out
}

/**
 * **Every row is padded to the column count.** A short last row otherwise
 * leaves a table whose widest row and whose width list disagree, which Word
 * renders as a cell of no declared width in an otherwise fixed layout - and
 * `widths.test.ts` fails it, which is how this was found rather than shipped.
 */
function padded(cells: Cell[], columns: number): Cell[] {
  return [...cells, ...Array.from({ length: columns - cells.length }, () => ({ text: '' }))]
}

const evenly = (columns: number): number[] =>
  Array.from({ length: columns }, () => 1 / columns)

/**
 * Figures as a strip: a muted label over a large value, wrapping every three.
 *
 * **Two rows per chunk rather than one row of pairs**, because the value has to
 * sit under its own label at a size the label does not have - a key/value table
 * reads as a record, and a strip reads as a dashboard, which is what the top of
 * a report is for.
 */
export function strip(figures: [string, string][]): Node[] {
  if (figures.length === 0) return []

  return chunk(figures, STRIP_COLS).map((row): TableNode => ({
    type: 'table',
    rows: [
      padded(
        row.map(([label]) => ({ text: label.toUpperCase(), mono: true, ink: MUTED })),
        STRIP_COLS,
      ),
      padded(
        row.map(([, value]) => ({ text: value, bold: true, ink: INK })),
        STRIP_COLS,
      ),
    ],
    widths: evenly(STRIP_COLS),
    // The strip's own ground is the label/value pairing; a zebra stripe across
    // it reads as two unrelated rows.
    zebra: false,
  }))
}

/**
 * A run of cells that carry their own ground: the phase path, the technique ids.
 *
 * **Wrapped into rows rather than squeezed into one.** Fourteen kill-chain
 * phases across A4 is 37pt a cell, and `command and control` is not going to
 * fit in it at any size worth reading - which is the same chop the strip's
 * three columns exist to avoid, arrived at from the other direction.
 */
export function band(cells: Cell[], columns: number): Node[] {
  if (cells.length === 0) return []

  return chunk(cells, columns).map((row): TableNode => ({
    type: 'table',
    rows: [padded(row, columns)],
    widths: evenly(columns),
    zebra: false,
  }))
}

/**
 * A compact chip for an identifier rather than a judgement.
 *
 * **A `chip`, not a `fill`.** A fill is the whole cell's ground, so a band of
 * six ids drew six full-width blocks with a word in the corner of each; the
 * chip mechanism paints the width of the text in both painters, which is what
 * makes a cluster of ids read as chips rather than as a sparse table.
 */
export function idChip(text: string): Cell {
  return { text, mono: true, chip: { kind: 'id', value: text } }
}

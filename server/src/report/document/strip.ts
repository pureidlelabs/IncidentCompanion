/**
 * The stat strip and the chip band: two shapes four sections all wanted.
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
 * **Every row is padded to the column count.**
 */
function padded(cells: Cell[], columns: number): Cell[] {
  return [...cells, ...Array.from({ length: columns - cells.length }, () => ({ text: '' }))]
}

const evenly = (columns: number): number[] =>
  Array.from({ length: columns }, () => 1 / columns)

/**
 * Figures as a strip: a muted label over a large value, wrapping every three.
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
 */
export function idChip(text: string): Cell {
  return { text, mono: true, chip: { kind: 'id', value: text } }
}

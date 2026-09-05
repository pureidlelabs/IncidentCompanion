/**
 * Squaring a table, for the written-section walker that builds one.
 *
 * Both painters assume a rectangle: pdfmake throws `Malformed table row` out of
 * its measure pass on a short row, and `word.ts` renders it short and says
 * nothing. So a ragged grid is padded to a rectangle here, once, rather than in
 * each painter.
 */
import type { Cell } from './model.js'

/** Equal shares summing to one, the convention both painters multiply out. */
export const evenly = (columns: number): number[] =>
  Array.from({ length: columns }, () => 1 / columns)

/** `row`, extended with blank cells to `columns`. */
export function padded(row: Cell[], columns: number): Cell[] {
  if (row.length >= columns) return row
  return [...row, ...Array.from({ length: columns - row.length }, () => ({ text: '' }))]
}

/** `header`, extended with blank labels to `columns`. */
export function paddedLabels(header: string[], columns: number): string[] {
  if (header.length >= columns) return header
  return [...header, ...Array.from({ length: columns - header.length }, () => '')]
}

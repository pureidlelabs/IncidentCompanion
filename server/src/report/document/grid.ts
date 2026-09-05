/**
 * Squaring a table, for the written-section walker that builds one.
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

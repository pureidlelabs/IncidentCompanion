/**
 * The ceilings a report body is read under, in one declarative place.
 */
import { z } from 'zod'

/** The most columns or rows one cell may claim. */
export const MAX_SPAN = 64

/** The widest and tallest grid a table builds; past either, the words are kept and the grid is not. */
export const MAX_COLUMNS = 128
export const MAX_ROWS = 512

/** How deep any walk recurses - a cell in a table in a cell, a list in a list. */
export const MAX_DEPTH = 128

/** How far a list indents, whatever the document nests. */
export const MAX_LIST_LEVEL = 12

/**
 * A `colspan` or `rowspan`, parsed as HTML parses one and clamped.
 */
const parsedSpan = z.preprocess(
  (value) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value),
  z.number().int().min(1).catch(1),
)

/** A span attribute value, coerced and clamped to `MAX_SPAN`. Never throws. */
export function spanOf(value: unknown): number {
  return Math.min(parsedSpan.parse(value), MAX_SPAN)
}

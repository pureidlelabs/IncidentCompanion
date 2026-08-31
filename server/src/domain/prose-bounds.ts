/**
 * The ceilings a report body is read under, in one declarative place.
 *
 * A written section is untrusted input: an analyst pastes a table out of a
 * vendor portal, and the span, the column count and the nesting depth are
 * whatever the source said. Each ceiling is the answer to a measured way that
 * turned a small paste into a large allocation - the write-up is in
 * `_security/a-pasted-colspan-exits-the-process.md`. They live here, not in the
 * walker, so the walk states what it draws and this states what it refuses.
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
 *
 * The clipboard parser stores the attribute verbatim and Yjs holds it as a
 * string, so a span arrives as `"2"`, `"1e3"` or `"10000000"`. HTML's grammar
 * is a non-negative integer or the default: `"1e3"` and `"0x10"` are one
 * column, not a thousand and sixteen. `catch(1)` covers everything the parse
 * rejects; the clamp is separate so an over-large span becomes `MAX_SPAN`
 * rather than falling to `1`.
 *
 * **No trim, deliberately.** A rejected span is one column, never a wider one,
 * so being stricter than HTML - which skips leading whitespace - is safe in the
 * only direction that matters: `" 2 "` is one column, not two.
 */
const parsedSpan = z.preprocess(
  (value) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value),
  z.number().int().min(1).catch(1),
)

/** A span attribute value, coerced and clamped to `MAX_SPAN`. Never throws. */
export function spanOf(value: unknown): number {
  return Math.min(parsedSpan.parse(value), MAX_SPAN)
}

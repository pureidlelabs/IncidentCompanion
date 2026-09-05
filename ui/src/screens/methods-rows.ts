import type { MethodEntry } from '@/api/model'

/**
 * The Methods table's narrowing and its two derived cells.
 *
 * Its own module rather than the screen's, so each can be attacked without
 * rendering a table.
 */

/** A stamp to the minute, with the `T` out, or `''` for nothing stated. */
function minute(stamp: string | null): string {
  const text = (stamp ?? '').trim()
  return text ? text.slice(0, 16).replace('T', ' ') : ''
}

/**
 * Whether a method matches what is typed in the toolbar's search box.
 *
 * The Name column and nothing else -- not the query, which is a couple of
 * hundred characters of a query language and would match `where` and
 * `summarize` on every row written in the same dialect.
 *
 * AND across whitespace-separated terms, so a second word narrows rather
 * than widens; a blank query matches every row.
 */
export function matchesMethod(row: MethodEntry, query: string): boolean {
  const hay = row.name.toLowerCase()
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

/**
 * The absolute window as one cell, or `''` where neither end was stated.
 *
 * Half a window prints as half a window: the missing end is an em dash rather
 * than the stated end repeated or a span this app worked out for itself.
 */
export function windowText(entry: MethodEntry): string {
  const from = minute(entry.windowFrom)
  const to = minute(entry.windowTo)
  if (!from && !to) return ''
  return `${from || '\u2014'} \u2192 ${to || '\u2014'}`
}

/**
 * What the Rows column prints, or `null` where nothing was stated.
 *
 * `0` is a result and `null` is a question nobody answered, so the two are
 * different returns rather than one falsy branch.
 */
export function rowsText(entry: MethodEntry): string | null {
  const count = entry.rowsReturned
  return count === null ? null : String(count)
}

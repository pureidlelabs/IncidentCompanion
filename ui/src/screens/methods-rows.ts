import type { MethodEntry } from '@/api/model'

/**
 * The Methods table's narrowing and its two derived cells.
 */

/** A stamp to the minute, with the `T` out, or `''` for nothing stated. */
function minute(stamp: string | null): string {
  const text = (stamp ?? '').trim()
  return text ? text.slice(0, 16).replace('T', ' ') : ''
}

/**
 * Whether a method matches what is typed in the toolbar's search box.
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
 */
export function windowText(entry: MethodEntry): string {
  const from = minute(entry.windowFrom)
  const to = minute(entry.windowTo)
  if (!from && !to) return ''
  return `${from || '\u2014'} \u2192 ${to || '\u2014'}`
}

/**
 * What the Rows column prints, or `null` where nothing was stated.
 */
export function rowsText(entry: MethodEntry): string | null {
  const count = entry.rowsReturned
  return count === null ? null : String(count)
}

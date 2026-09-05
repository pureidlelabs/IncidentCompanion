import type { EvidenceEntry } from '@/api/model'

/**
 * The Evidence table's narrowing.
 */

/**
 * Whether a record matches what is typed in the toolbar's search box.
 */
export function matchesRecord(row: EvidenceEntry, query: string): boolean {
  const hay = row.name.toLowerCase()
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

import type { ImpactEntry } from '@/api/model'

/**
 * Which impact columns a case earns, and how a byte count reads.
 *
 * Holds no component, so the screen file and its tests read one projection.
 */

/** The fields a column could be built from, in the order the table shows them. */
export const OPTIONAL_COLUMNS = ['category', 'subjectCount', 'recordCount', 'systemId'] as const
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]

/**
 * The optional columns something in this case fills.
 *
 * **A numeric zero is filled.** "Zero data subjects" is an answer and a blank
 * is not, so the two cannot share a test - and a `!value` check counts the
 * answer as the absence.
 *
 * Against the whole collection rather than the filtered rows: narrowing to one
 * record would take out every column that record leaves blank, and the grid
 * would rearrange itself under a search.
 */
export function shownColumns(rows: readonly ImpactEntry[]): Set<OptionalColumn> {
  return new Set(
    OPTIONAL_COLUMNS.filter((field) =>
      rows.some((row) => {
        const value = row[field]
        if (typeof value === 'number') return true
        return typeof value === 'string' && value.trim() !== ''
      }),
    ),
  )
}

/** A byte count in the unit an analyst quotes it in. */
export function volumeText(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || bytes <= 0) return ''
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let step = 0
  while (value >= 1000 && step < units.length - 1) {
    value /= 1000
    step += 1
  }
  return `${step === 0 ? String(value) : value.toFixed(1)} ${units[step] ?? ''}`
}

/**
 * Whether an impact record matches what is typed in the toolbar's search box.
 *
 * **The Data column and nothing else** - which is `label`, the data's own name.
 * The category, what happened to it, the counts and the host it was held on are
 * their own columns and are not searched; neither are the notes or the tags,
 * which the table draws in no column at all. AND across whitespace-separated
 * terms, so a second word narrows rather than widens; a blank query matches
 * every row.
 */
export function matchesData(row: ImpactEntry, query: string): boolean {
  const hay = row.label.toLowerCase()
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

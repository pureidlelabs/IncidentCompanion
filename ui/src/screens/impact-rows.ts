import type { ImpactEntry } from '@/api/model'

/**
 * Which impact columns a case earns, and how a byte count reads.
 */

/** The fields a column could be built from, in the order the table shows them. */
export const OPTIONAL_COLUMNS = ['category', 'subjectCount', 'recordCount', 'systemId'] as const
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]

/**
 * The optional columns something in this case fills.
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

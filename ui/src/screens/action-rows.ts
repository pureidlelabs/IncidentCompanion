import type { ActionEntry } from '@/api/model'

/**
 * The Actions table's narrowing.
 */

/**
 * Whether a task matches what is typed in the toolbar's search box.
 */
export function matchesTask(row: ActionEntry, query: string): boolean {
  const hay = row.task.toLowerCase()
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

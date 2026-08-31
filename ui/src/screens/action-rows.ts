import type { ActionEntry } from '@/api/model'

/**
 * The Actions table's narrowing.
 *
 * Its own module rather than the screen's, so the predicate can be attacked
 * without rendering a table.
 */

/**
 * Whether a task matches what is typed in the toolbar's search box.
 *
 * **The Task column and nothing else.** The box's badge names one column, so a
 * value carried by another - the type, the status, the assignee, the due date -
 * is not a match, and neither is a tag, which the table draws in no column at
 * all. AND across whitespace-separated terms, so a second word narrows rather
 * than widens; a blank query matches every row.
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

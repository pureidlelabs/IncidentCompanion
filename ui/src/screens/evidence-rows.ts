import type { EvidenceEntry } from '@/api/model'
import { matchesWords } from '@/lib/word-match'

/**
 * The Evidence table's narrowing.
 *
 * Its own module rather than the screen's, so the predicate can be attacked
 * without rendering a table.
 */

/**
 * Whether a record matches what is typed in the toolbar's search box.
 *
 * **The Name column and nothing else.** The badge reads `Record`, and the table
 * has no such column: the row *is* the record, and the column carrying its own
 * name is `Name`. So the state, the type, the host, the location, the hash and
 * the classification beside it are not searched, and neither is a tag, which
 * the table draws in no column at all.
 */
export function matchesRecord(row: EvidenceEntry, query: string): boolean {
  return matchesWords(row.name, query)
}

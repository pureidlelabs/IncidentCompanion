import type { CaseNote } from '@/api/model'
import { msOf } from '@/lib/case-time'

/**
 * How the notes index is ordered, and what a row shows of a note.
 */

/** Newest first. An unparseable stamp sorts oldest, never first. */
export function newestFirst(notes: readonly CaseNote[]): CaseNote[] {
  return [...notes].sort((left, right) => (msOf(right.createdAt) ?? -Infinity) - (msOf(left.createdAt) ?? -Infinity))
}

/** The first line, for the index row. A note's own opening is its title. */
export function openingOf(note: CaseNote): string {
  const line = note.note.split('\n').find((one) => one.trim() !== '') ?? ''
  return line.trim()
}

/** Nothing written in it. Whitespace counts as nothing. */
export function isBlank(note: CaseNote): boolean {
  return note.note.trim() === ''
}

/**
 * The notes without the one at `id`, if that one is blank.
 */
export function withoutBlank(notes: readonly CaseNote[], id: string | undefined): CaseNote[] {
  if (id === undefined) return [...notes]
  return notes.filter((note) => note.id !== id || !isBlank(note))
}

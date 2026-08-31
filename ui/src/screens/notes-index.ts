import type { CaseNote } from '@/api/model'
import { msOf } from '@/lib/case-time'

/**
 * How the notes index is ordered, and what a row shows of a note.
 *
 * Holds no component, so the screen file and its tests read one projection.
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
 *
 * What `New note` makes is a note, not a draft - it is in the index from the
 * moment it exists, and every keystroke is kept. The cost of that is a row
 * with nothing to read in it when somebody presses the door and walks away,
 * and this is what pays it: leaving a blank note is what discards it.
 *
 * Only the named note, and only while it is blank - a note somebody
 * deliberately emptied is still theirs until they leave it.
 */
export function withoutBlank(notes: readonly CaseNote[], id: string | undefined): CaseNote[] {
  if (id === undefined) return [...notes]
  return notes.filter((note) => note.id !== id || !isBlank(note))
}

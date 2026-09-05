import type { Chord } from '@/lib/chords'

/**
 * Every shortcut the app can be told to run, and how one prints.
 *
 * **One registry, three surfaces.** The cheat sheet, the command palette and
 * the document listener all read this table; nothing anywhere writes a key or a
 * sheet row by hand, because a row that is not true on the screen showing it
 * takes every other row's authority with it.
 */

/** Something the app can be told to do, from any of its three surfaces. */
export interface Command {
  id: string
  /** Analyst-facing, and the string the palette matches on. */
  title: string
  /** The sheet's grouping, in declaration order. */
  group: string
  chords: readonly Chord[]
  /** The section whose toolbar offers it. Absent means the command is global. */
  section?: string
  /** Set where the app has no honest surface: declared for the sheet, never dispatched. */
  parked?: boolean
}

/**
 * The registry, and the one place a shortcut is written down.
 *
 * Two spellings that read as oversights and are not:
 *
 * - **`n` is "new timeline entry", not "new entry in the current section".**
 *   Sections own their own create control and there is no shell-level slot to
 *   reach for, so the command is named for what it does.
 * - **New report carries no chord.** `n` is Timeline's, and a second command
 *   claiming it makes the keypress ambiguous rather than section-scoped -
 *   a chord resolves before anything knows which section is mounted.
 */
export const COMMANDS: readonly Command[] = [
  { id: 'palette', title: 'Open the command palette', group: 'Getting around', chords: [{ key: 'k', mod: true }] },
  { id: 'search', title: 'Search this case', group: 'Getting around', chords: [{ key: '/' }] },
  { id: 'new-entry', title: 'New timeline entry', group: 'Getting around', chords: [{ key: 'n' }], section: 'timeline' },
  { id: 'new-activity', title: 'New SOC activity', group: 'Getting around', chords: [{ key: 'a' }], section: 'timeline' },
  { id: 'new-report', title: 'New report', group: 'Getting around', chords: [], section: 'report' },
  { id: 'node-list', title: 'Toggle the investigation graph entity list', group: 'Getting around', chords: [{ key: 'l' }] },
  {
    id: 'leave-case',
    // Shift-qualified because closing is not destructive, but a stray single
    // keypress should not leave the case.
    title: 'Close the case and go back to the picker',
    group: 'Getting around',
    chords: [{ key: 'q', shift: true }],
  },
  { id: 'shortcuts', title: 'Show this list', group: 'Help', chords: [{ key: '?' }] },
]

/** The registry in its declared groups, in declaration order. */
export function commandGroups(
  commands: readonly Command[],
): { group: string; commands: Command[] }[] {
  const order: string[] = []
  const byGroup = new Map<string, Command[]>()
  for (const command of commands) {
    if (!byGroup.has(command.group)) {
      byGroup.set(command.group, [])
      order.push(command.group)
    }
    byGroup.get(command.group)?.push(command)
  }
  return order.map((group) => ({ group, commands: byGroup.get(group) ?? [] }))
}

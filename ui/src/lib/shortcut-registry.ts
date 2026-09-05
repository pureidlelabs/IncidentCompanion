import type { Chord } from '@/lib/chords'

/**
 * Every shortcut the app can be told to run, and how one prints.
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

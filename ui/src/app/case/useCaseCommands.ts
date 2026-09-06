import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { commandPath } from '@/lib/command-request'
import { COMMANDS } from '@/lib/shortcut-registry'

export interface CaseCommandHooks {
  caseId: string
  /** Put the caret in the omnibox. Both `palette` and `search` are this. */
  onFocusSearch: () => void
  onShortcuts: () => void
}

/**
 * What a command does, for every surface that can ask for one.
 *
 * **One dispatcher, because there is one vocabulary.** The keyboard listener
 * and the omnibox both commit the same ids, and two copies of this switch is
 * two answers to what `n` does.
 */
export function useCaseCommands({ caseId, onFocusSearch, onShortcuts }: CaseCommandHooks): {
  run: (id: string) => void
  commit: (rowId: string) => void
} {
  const navigate = useNavigate()

  const run = useCallback(
    (id: string) => {
      const base = `/cases/${encodeURIComponent(caseId)}`
      const go = (to: string) => {
        void navigate(to)
      }
      switch (id) {
          case 'palette':
        case 'search':
          // **After the frame, not in it.** Committing a row closes the
          // results, and React Aria restores focus as that unmounts -- taking
          // the caret back out of the box this just put it in.
          requestAnimationFrame(onFocusSearch)
          return
        case 'shortcuts':
          onShortcuts()
          return
        case 'leave-case':
          // Nothing to close: the open case is the URL.
          go('/cases')
          return
        case 'node-list':
          go(`${base}/investigation-graph`)
          return
        default: {
          // A section's own command travels to that section carrying itself,
          // because the screen owning the control is not mounted yet.
          const command = COMMANDS.find((one) => one.id === id)
          if (command?.section !== undefined) go(commandPath(base, command.section, id))
          return
        }
      }
    },
    [caseId, navigate, onFocusSearch, onShortcuts],
  )

  /**
   * A committed row, read off its own id: `command:<id>`, `section:<slug>` or
   * `row:<slug>:<id>`. A case row lands on its section; there is no per-entry
   * address.
   */
  const commit = useCallback(
    (rowId: string) => {
      const [kind, first] = rowId.split(':')
      if (first === undefined) return
      if (kind === 'command') {
        run(first)
        return
      }
      if (kind === 'section' || kind === 'row') {
        void navigate(`/cases/${encodeURIComponent(caseId)}/${first}`)
      }
    },
    [caseId, navigate, run],
  )

  return { run, commit }
}

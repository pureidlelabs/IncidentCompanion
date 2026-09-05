import { useCallback, useEffect, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'

import { useCase } from '@/api/case'
import { useCaseId } from '@/app/useCaseId'
import { aDialogIsOpen, chordEventOf, chordFires, isTypingTarget } from '@/lib/chords'
import { CheatSheetDialog } from '@/components/blocks/cheat-sheet'
import { CommandPaletteDialog } from '@/components/blocks/command-palette-dialog'
import { COMMANDS, type Command } from '@/lib/shortcut-registry'

/**
 * The case's keyboard: one document listener, the palette, and the sheet.
 *
 * One listener for the whole case, because a chord resolves against the
 * registry before anything knows which section is mounted. Both dialogs are
 * held here because each has more than one opener.
 *
 * A control that types keeps its own keyboard, and an open dialog keeps it
 * outright.
 */
export interface ChordLayerContainerProps {
  /** Seeded into the palette's field each time it opens. */
  paletteQuery?: string
  /** Focuses the header's search box. Without one the search chord does nothing. */
  onSearch?: (() => void) | undefined
  /**
   * Filled with the runner, so a control outside the layer can run a command
   * without a second copy of what each one does.
   */
  runnerRef?: RefObject<((id: string) => void) | null> | undefined
}

export function ChordLayerContainer({
  paletteQuery = '',
  onSearch,
  runnerRef,
}: ChordLayerContainerProps) {
  const caseId = useCaseId()
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Only while the palette is open: this is mounted on every section, and an
  // eager read is the whole case document on each of them.
  const kase = useCase(caseId, paletteOpen)

  const run = useCallback(
    (id: string) => {
      const base = `/cases/${encodeURIComponent(caseId)}`
      const go = (to: string) => {
        void navigate(to)
      }
      switch (id) {
        case 'palette':
          setPaletteOpen(true)
          return
        case 'shortcuts':
          setSheetOpen(true)
          return
        case 'search':
          onSearch?.()
          return
        case 'leave-case':
          // Nothing to close: the open case is the URL.
          go('/cases')
          return
        case 'node-list':
          go(`${base}/investigation-graph`)
          return
        default: {
          // A section's own command goes to the section holding the control.
          // Pressing it needs a handler no screen publishes yet.
          const command = COMMANDS.find((one) => one.id === id)
          if (command?.section !== undefined) go(`${base}/${command.section}`)
          return
        }
      }
    },
    [caseId, navigate, onSearch],
  )

  useEffect(() => {
    if (runnerRef !== undefined) runnerRef.current = run
  }, [run, runnerRef])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if (aDialogIsOpen(document)) return
      const command = commandFor(event)
      if (!command) return
      event.preventDefault()
      run(command.id)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [run])

  return (
    <>
      <CommandPaletteDialog
        isOpen={paletteOpen}
        onOpenChange={setPaletteOpen}
        query={paletteQuery}
        kase={kase.data}
        onAction={(rowId) => {
          setPaletteOpen(false)
          commit(rowId, caseId, run, (to) => {
            void navigate(to)
          })
        }}
      />
      <CheatSheetDialog isOpen={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  )
}

/** The command a keypress fires, or `undefined`. First match wins. */
function commandFor(event: KeyboardEvent): Command | undefined {
  const pressed = chordEventOf(event)
  return COMMANDS.find(
    (command) =>
      command.parked !== true && command.chords.some((chord) => chordFires(chord, pressed)),
  )
}

/**
 * What a committed palette row does, read off its own id.
 *
 * A row is `command:<id>`, `section:<slug>` or `row:<slug>:<id>`, so the
 * prefix is the whole vocabulary. A case row lands on its section: there is no
 * per-entry address.
 */
export function commit(
  rowId: string,
  caseId: string,
  run: (id: string) => void,
  go: (to: string) => void,
): void {
  const base = `/cases/${encodeURIComponent(caseId)}`
  const [kind, first] = rowId.split(':')
  if (kind === 'command' && first !== undefined) {
    run(first)
    return
  }
  if ((kind === 'section' || kind === 'row') && first !== undefined) {
    go(`${base}/${first}`)
  }
}

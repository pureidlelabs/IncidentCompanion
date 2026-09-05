import { useCallback, useEffect, useState } from 'react'

import { useCaseId } from '@/app/useCaseId'
import { useCaseCommands } from '@/app/case/useCaseCommands'
import { aDialogIsOpen, chordEventOf, chordFires, isTypingTarget } from '@/lib/chords'
import { CheatSheetDialog } from '@/components/blocks/cheat-sheet'
import { COMMANDS, type Command } from '@/lib/shortcut-registry'

/**
 * The case's keyboard: one document listener, and the sheet it can open.
 *
 * One listener for the whole case, because a chord resolves against the
 * registry before anything knows which section is mounted. What a command then
 * does is `useCaseCommands`, which the omnibox commits into as well.
 *
 * A control that types keeps its own keyboard, and an open dialog keeps it
 * outright.
 */
export interface ChordLayerContainerProps {
  /** Puts the caret in the omnibox. Without one, `/` and `Mod+K` do nothing. */
  onSearch?: (() => void) | undefined
}

export function ChordLayerContainer({ onSearch }: ChordLayerContainerProps) {
  const caseId = useCaseId()
  const [sheetOpen, setSheetOpen] = useState(false)

  const focusSearch = useCallback(() => {
    onSearch?.()
  }, [onSearch])
  const shortcuts = useCallback(() => {
    setSheetOpen(true)
  }, [])

  const { run } = useCaseCommands({ caseId, onFocusSearch: focusSearch, onShortcuts: shortcuts })

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

  return <CheatSheetDialog isOpen={sheetOpen} onOpenChange={setSheetOpen} />
}

/** The command a keypress fires, or `undefined`. First match wins. */
function commandFor(event: KeyboardEvent): Command | undefined {
  const pressed = chordEventOf(event)
  return COMMANDS.find(
    (command) =>
      command.parked !== true && command.chords.some((chord) => chordFires(chord, pressed)),
  )
}

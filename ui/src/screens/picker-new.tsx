import type { ReactNode } from 'react'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'
import { StartCasePane } from '@/components/blocks/start-case-pane'

/** The picker, on New case: the two doors a case can start from. */
export interface PickerNewScreenProps {
  /** Who is signed in, at the rail's foot. */
  analyst: string
  /** Opens the About door from the rail's head. */
  onAbout: () => void
  /** Where a rail row goes. Without it the rows are inert. */
  onPane?: ((pane: PickerPane) => void) | undefined
  /** Opens the archive reader from the rail. Inert without one. */
  onImportArchive?: (() => void) | undefined
  /** The user footer's menu rows, from the app. */
  userMenu: ReactNode
  /** What went wrong reading this pane. */
  problem?: string | Error | undefined
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
  /** This pane's data is still being read. */
  busy?: boolean
  /** Open the blank-case form, over this pane rather than replacing it. */
  onBlank?: (() => void) | undefined
  /** The same form, landing in the importer. */
  onImport?: (() => void) | undefined
}

export function PickerNewScreen({ onAbout, onBlank, onImport, analyst, onPane, onImportArchive, userMenu, problem, onRetry, busy }: PickerNewScreenProps) {
  return (
    <PickerFrame
      pane="new"
      analyst={analyst}
      {...(onPane ? { onPane } : {})}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(problem === undefined ? {} : { problem })}
      {...(onRetry ? { onRetry } : {})}
      {...(busy ? { busy } : {})}
    >
      <StartCasePane
        {...(onBlank ? { onBlank } : {})}
        {...(onImport ? { onImport } : {})}
      />
    </PickerFrame>
  )
}

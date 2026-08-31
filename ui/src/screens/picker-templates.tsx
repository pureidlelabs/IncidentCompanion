import type { ReactNode } from 'react'
import { LibraryCollection, type LibraryRow } from '@/components/blocks/library-collection'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'

/** The picker, on Case templates: checklists a new case can start from. */
export interface PickerTemplatesScreenProps {
  /** The install's case templates. Absent draws an empty list. */
  entries: readonly LibraryRow[] | undefined
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
}

export function PickerTemplatesScreen({
  onAbout,
  entries: entriesGiven,
  analyst,
  onPane,
  onImportArchive,
  userMenu,
  problem,
  onRetry,
  busy,
}: PickerTemplatesScreenProps) {
  const entries = entriesGiven ?? []
  return (
    <PickerFrame
      pane="templates"
      analyst={analyst}
      {...(onPane ? { onPane } : {})}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(problem === undefined ? {} : { problem })}
      {...(onRetry ? { onRetry } : {})}
      {...(busy ? { busy } : {})}
    >
      <LibraryCollection
        title="Case templates"
        blurb="Checklists a new case can start from."
        noun="template"
        entries={entries}
        newLabel="New template"
      />
    </PickerFrame>
  )
}

import type { ReactNode } from 'react'
import { LibraryCollection, type LibraryRow } from '@/components/blocks/library-collection'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'

/** The picker, on Reports: the layouts a report can start from. */
export interface PickerReportsScreenProps {
  /** The install's report layouts. Absent draws an empty list. */
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

export function PickerReportsScreen({
  onAbout,
  entries: entriesGiven,
  analyst,
  onPane,
  onImportArchive,
  userMenu,
  problem,
  onRetry,
  busy,
}: PickerReportsScreenProps) {
  const entries = entriesGiven ?? []
  return (
    <PickerFrame
      pane="reports"
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
        title="Reports"
        blurb="The layouts a report can start from."
        noun="layout"
        group="Layouts"
        entries={entries}
      />
    </PickerFrame>
  )
}

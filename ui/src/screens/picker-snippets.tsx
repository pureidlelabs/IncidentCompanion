import type { ReactNode } from 'react'
import { LibraryCollection, type LibraryRow } from '@/components/blocks/library-collection'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'

/** The picker, on Snippets: paragraphs to drop into a written section. */
export interface PickerSnippetsScreenProps {
  /** The install's snippets. Absent draws an empty list. */
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

export function PickerSnippetsScreen({
  onAbout,
  entries: entriesGiven,
  analyst,
  onPane,
  onImportArchive,
  userMenu,
  problem,
  onRetry,
  busy,
}: PickerSnippetsScreenProps) {
  const entries = entriesGiven ?? []
  return (
    <PickerFrame
      pane="snippets"
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
        title="Snippets"
        blurb="Paragraphs to drop into a written section, in each language you write."
        noun="snippet"
        entries={entries}
        newLabel="New snippet"
      />
    </PickerFrame>
  )
}

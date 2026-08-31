import type { ReactNode } from 'react'
import type { CaseSummary } from '@/api/case'
import { CaseList } from '@/components/blocks/case-list'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'

/** The picker, on Your cases: every case on disk, sorted and searched. */
export interface PickerCasesScreenProps {
  /** Every case the install holds. Absent draws an empty list. */
  cases: readonly CaseSummary[] | undefined
  /** What the search box opens with. */
  search?: string
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

export function PickerCasesScreen({
  onAbout,
  cases: casesGiven,
  search = '',
  analyst,
  onPane,
  onImportArchive,
  userMenu,
  problem,
  onRetry,
  busy,
}: PickerCasesScreenProps) {
  const cases = casesGiven ?? []
  return (
    <PickerFrame
      pane="cases"
      analyst={analyst}
      {...(onPane ? { onPane } : {})}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(problem === undefined ? {} : { problem })}
      {...(onRetry ? { onRetry } : {})}
      {...(busy ? { busy } : {})}
    >
      {/* The empty install's two ways in land on another pane, so they are
          the rail's business rather than the list's. */}
      <CaseList
        cases={cases}
        search={search}
        onNewCase={() => {
          onPane?.('new')
        }}
        onDemoCases={() => {
          onPane?.('demos')
        }}
      />
    </PickerFrame>
  )
}

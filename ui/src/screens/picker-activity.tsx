import { useState, type ReactNode } from 'react'
import { ActivityLog, type AuditRow } from '@/components/blocks/activity-log'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'

/** The picker, on Activity: the installation's own log. */
export interface PickerActivityScreenProps {
  /** Lines in the installation's own log. Absent draws an empty list. */
  audit: readonly AuditRow[] | undefined
  /** Milliseconds, for the range the log is read over. Defaults to the clock. */
  now?: number | undefined
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

export function PickerActivityScreen({
  onAbout,
  audit: auditGiven,
  analyst,
  onPane,
  onImportArchive,
  userMenu,
  problem,
  onRetry,
  busy,
  now,
}: PickerActivityScreenProps) {
  // Read once on mount rather than on every render: a clock call in the render
  // body is impure, and a relative time that shifts when the pane happens to
  // re-render is a different number for no reason the analyst caused.
  const [mounted] = useState(() => Date.now())
  const audit = auditGiven ?? []
  return (
    <PickerFrame
      pane="activity"
      analyst={analyst}
      {...(onPane ? { onPane } : {})}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(problem === undefined ? {} : { problem })}
      {...(onRetry ? { onRetry } : {})}
      {...(busy ? { busy } : {})}
    >
      <ActivityLog audit={audit} now={now ?? mounted} />
    </PickerFrame>
  )
}

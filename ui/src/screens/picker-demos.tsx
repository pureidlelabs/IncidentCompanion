import type { ReactNode } from 'react'
import { DemosPane } from '@/components/blocks/demos-pane'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'
import type { DemoRow } from '@/components/blocks/picker-rows'

/** The picker, on Demo cases: the worked cases an install ships with. */
export interface PickerDemosScreenProps {
  /** The demo cases this install seeds. Defaults to a worked set. */
  demos?: readonly DemoRow[]
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
  /** Where a demo card goes. */
  href: (demo: DemoRow) => string
}

export function PickerDemosScreen({ onAbout, demos, analyst, onPane, onImportArchive, userMenu, problem, onRetry, busy, href }: PickerDemosScreenProps) {
  return (
    <PickerFrame
      pane="demos"
      analyst={analyst}
      {...(onPane ? { onPane } : {})}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(problem === undefined ? {} : { problem })}
      {...(onRetry ? { onRetry } : {})}
      {...(busy ? { busy } : {})}
    >
      <DemosPane href={href} {...(demos ? { demos } : {})} />
    </PickerFrame>
  )
}

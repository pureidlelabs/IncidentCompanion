import type { ReactNode } from 'react'
import { HealthPane, type HealthPaneProps } from '@/components/blocks/health-pane'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'

/** The picker, on Health: what this install is doing, and whether it is coping. */
export interface PickerHealthScreenProps {
  /**
   * What this install is serving, and how much room it has left.
   *
   * Every field defaults to the fixture the gallery draws, so a story needs
   * none of them and a container passes what it read.
   */
  health: HealthPaneProps
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

export function PickerHealthScreen({ onAbout, health, analyst, onPane, onImportArchive, userMenu, problem, onRetry, busy }: PickerHealthScreenProps) {
  return (
    <PickerFrame
      pane="health"
      analyst={analyst}
      {...(onPane ? { onPane } : {})}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(problem === undefined ? {} : { problem })}
      {...(onRetry ? { onRetry } : {})}
      {...(busy ? { busy } : {})}
    >
      <HealthPane {...health} />
    </PickerFrame>
  )
}

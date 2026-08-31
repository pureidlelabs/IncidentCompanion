import type { ReactNode } from 'react'
import { LanguagesPane } from '@/components/blocks/languages-pane'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'
import { type LanguageRow } from '@/components/blocks/picker-rows'

/** The picker, on Report languages: which languages a report may be written in. */
export interface PickerLanguagesScreenProps {
  /** Languages a report may be written in. Absent draws an empty list. */
  languages: readonly LanguageRow[] | undefined
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

export function PickerLanguagesScreen({
  onAbout,
  languages: languagesGiven,
  analyst,
  onPane,
  onImportArchive,
  userMenu,
  problem,
  onRetry,
  busy,
}: PickerLanguagesScreenProps) {
  const languages = languagesGiven ?? []
  return (
    <PickerFrame
      pane="languages"
      analyst={analyst}
      {...(onPane ? { onPane } : {})}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(problem === undefined ? {} : { problem })}
      {...(onRetry ? { onRetry } : {})}
      {...(busy ? { busy } : {})}
    >
      <LanguagesPane languages={languages} />
    </PickerFrame>
  )
}

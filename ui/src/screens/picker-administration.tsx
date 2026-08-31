import type { ReactNode } from 'react'
import { useState } from 'react'
import type { AccountRow } from '@/components/blocks/account-table'
import { AdministrationPane } from '@/components/blocks/administration-pane'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'

/** The picker, on Administration: what this install is set to, and who may reach it. */
export interface PickerAdministrationScreenProps {
  /** Accounts this install holds. Absent draws an empty list. */
  accounts: readonly AccountRow[] | undefined
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

export function PickerAdministrationScreen({
  onAbout,
  accounts: accountsGiven,
  analyst,
  onPane,
  onImportArchive,
  userMenu,
  problem,
  onRetry,
  busy,
}: PickerAdministrationScreenProps) {
  // **The screen owns the roster.** The table it ends up in draws its tabs
  // from the same list this pane counts, so neither may hold its own copy.
  const [accounts, setAccounts] = useState<readonly AccountRow[]>(accountsGiven ?? [])
  const [given, setGiven] = useState(accountsGiven)
  if (given !== accountsGiven) {
    setGiven(accountsGiven)
    setAccounts(accountsGiven ?? [])
  }
  return (
    <PickerFrame
      pane="administration"
      analyst={analyst}
      {...(onPane ? { onPane } : {})}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(problem === undefined ? {} : { problem })}
      {...(onRetry ? { onRetry } : {})}
      {...(busy ? { busy } : {})}
    >
      {/* **Four of these six have no source, and the controls write nothing.**
          `GET /api/settings` serves the install's transport, storage and
          limits; retention, sign-in policy and the two absent-setting lists are
          not served at all, and no route writes any of them. Passed absent
          rather than filled from a sample, so the pane draws nothing where it
          used to draw invented retention periods.
          -> issue 50 */}
      <AdministrationPane
        accounts={accounts}
        onAccountState={(id, state) => {
          setAccounts((current) =>
            current.map((one) => (one.id === id ? { ...one, state } : one)),
          )
        }}
        audit={undefined}
        regimes={undefined}
        signIn={undefined}
        limits={undefined}
        absentSignIn={undefined}
        absentForwarding={undefined}
      />
    </PickerFrame>
  )
}

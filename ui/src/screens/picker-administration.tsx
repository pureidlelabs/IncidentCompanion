import type { ReactNode } from 'react'
import type { AccountTableRow } from '@/components/blocks/account-table'
import type { BoundRow } from '@/components/blocks/picker-rows'
import { AdministrationPane } from '@/components/blocks/administration-pane'
import { PickerFrame } from '@/components/blocks/picker-frame'
import type { PickerPane } from '@/components/blocks/picker-panes'

/** The picker, on Administration: what this install is set to, and who may reach it. */
export interface PickerAdministrationScreenProps {
  /** Accounts this install holds. Absent draws an empty list. */
  accounts: readonly AccountTableRow[] | undefined
  /** Who is signed in, at the rail's foot. */
  analyst: string
  /** Whether to offer the rail rows only an administrator may use. */
  admin?: boolean | undefined
  /** The sign-in windows this install sets. Absent draws none. */
  signIn?: readonly BoundRow[] | undefined
  /**
   * The roster's writes. `onState` is required for the reason the Accounts
   * pane's is: this pane draws the same table, and a row that moves without
   * writing is the same defect wherever it is pressed.
   */
  onState: (username: string, next: AccountTableRow['state']) => void
  /** Ends every session one account holds. Absent draws no such row. */
  onEndSessions?: ((username: string) => void) | undefined
  /** The roles this install offers, for the row's role rows. */
  roles?: readonly string[] | undefined
  /** Moves an account to a role. Absent draws no role rows. */
  onRole?: ((username: string, role: string) => void) | undefined
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
  admin,
  signIn,
  onState,
  onEndSessions,
  roles,
  onRole,
  onPane,
  onImportArchive,
  userMenu,
  problem,
  onRetry,
  busy,
}: PickerAdministrationScreenProps) {
  return (
    <PickerFrame
      pane="administration"
      analyst={analyst}
      admin={admin}
      {...(onPane ? { onPane } : {})}
      {...(onImportArchive ? { onImportArchive } : {})}
      userMenu={userMenu}
      onAbout={onAbout}
      {...(problem === undefined ? {} : { problem })}
      {...(onRetry ? { onRetry } : {})}
      {...(busy ? { busy } : {})}
    >
      {/* **The sign-in windows are served and written; the rest are not.**
          `GET /api/install/policy` states both session windows with the bounds
          the server enforces, and `PUT` takes them. Retention, the regimes and
          the two absent-setting lists have no route, so they are passed absent
          rather than filled from a sample: a pane drawing invented retention
          periods tells an operator the install is set to something it is
          not. */}
      <AdministrationPane
        accounts={accountsGiven ?? []}
        onAccountState={onState}
        {...(onEndSessions ? { onEndSessions } : {})}
        {...(onRole ? { roles, onRole } : {})}
        audit={undefined}
        regimes={undefined}
        signIn={signIn}
        limits={undefined}
        absentSignIn={undefined}
        absentForwarding={undefined}
      />
    </PickerFrame>
  )
}

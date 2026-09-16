import type { ReactNode } from 'react'
import type { AccountTableRow } from '@/components/blocks/account-table'
import { AccountsPane } from '@/components/blocks/accounts-pane'
import { NewAccountDialog, type NewAccount } from '@/components/blocks/new-account-dialog'
import { PickerFrame } from '@/components/blocks/picker-frame'
import { useState } from 'react'
import type { PickerPane } from '@/components/blocks/picker-panes'

/** The picker, on Accounts: who may sign in, and what each may reach. */
export interface PickerAccountsScreenProps {
  /** The roles the server named, for the mint-an-account door. */
  roles: readonly string[]
  defaultRole: string
  /** Writes an account. The door stays open when the server refuses. */
  onCreate: (account: NewAccount) => void
  /** A create is in flight. */
  creating?: boolean
  /** What the server said, when it refused a create. */
  refusal?: string | undefined
  /** Accounts this install holds. Absent draws an empty list. */
  accounts: readonly AccountTableRow[] | undefined
  /**
   * Writes an account's state. Absent, the row flips locally instead, which is
   * what the gallery needs and what an install must never get: a row that moved
   * and a server that was never told.
   */
  onState?: ((username: string, next: AccountTableRow['state']) => void) | undefined
  /** Ends every session one account holds. Absent draws no such row. */
  onEndSessions?: ((username: string) => void) | undefined
  /** Who is signed in, at the rail's foot. */
  analyst: string
  /** Whether to offer the rail rows only an administrator may use. */
  admin?: boolean | undefined
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

export function PickerAccountsScreen({
  onAbout,
  roles,
  defaultRole,
  onCreate,
  creating = false,
  refusal,
  accounts: accountsGiven,
  onState,
  onEndSessions,
  analyst,
  admin,
  onPane,
  onImportArchive,
  userMenu,
  problem,
  onRetry,
  busy,
}: PickerAccountsScreenProps) {
  const [minting, setMinting] = useState(false)

  // **The screen owns the roster, not the table.** Enabling and disabling are
  // written here so that the pane's count line and the table's tabs read one
  // list; a copy held inside the table left the two counting different things.
  const [accounts, setAccounts] = useState<readonly AccountTableRow[]>(accountsGiven ?? [])
  const [given, setGiven] = useState(accountsGiven)
  if (given !== accountsGiven) {
    setGiven(accountsGiven)
    setAccounts(accountsGiven ?? [])
  }
  return (
    <PickerFrame
      pane="accounts"
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
      <>
        <AccountsPane
          accounts={accounts}
          onNewAccount={() => {
            setMinting(true)
          }}
          {...(onEndSessions ? { onEndSessions } : {})}
          onState={(id, state) => {
            if (onState) {
              onState(id, state)
              return
            }
            setAccounts((current) =>
              current.map((one) => (one.id === id ? { ...one, state } : one)),
            )
          }}
        />
        {/* **Here rather than in the container.** A dialog a container mounts
            is one the gallery never shows, so the screen an analyst sees and
            the screen the maintainer judged stop being the same. */}
        <NewAccountDialog
          isOpen={minting}
          onOpenChange={setMinting}
          roles={roles}
          defaultRole={defaultRole}
          isPending={creating}
          {...(refusal === undefined ? {} : { problem: refusal })}
          onCreate={onCreate}
        />
      </>
    </PickerFrame>
  )
}

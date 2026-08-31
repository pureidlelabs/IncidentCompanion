import type { ReactNode } from 'react'
import type { AccountRow } from '@/components/blocks/account-table'
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

export function PickerAccountsScreen({
  onAbout,
  roles,
  defaultRole,
  onCreate,
  creating = false,
  refusal,
  accounts: accountsGiven,
  analyst,
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
  const [accounts, setAccounts] = useState<readonly AccountRow[]>(accountsGiven ?? [])
  const [given, setGiven] = useState(accountsGiven)
  if (given !== accountsGiven) {
    setGiven(accountsGiven)
    setAccounts(accountsGiven ?? [])
  }
  return (
    <PickerFrame
      pane="accounts"
      analyst={analyst}
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
          onState={(id, state) => {
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

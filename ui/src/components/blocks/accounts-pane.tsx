import { AccountTable, accountCountLine, type AccountTableRow } from '@/components/blocks/account-table'
import { Section } from '@/components/blocks/section'
import { useState } from 'react'

import { AlertDialog } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export interface AccountsPaneProps {
  accounts: readonly AccountTableRow[]
  /** Opens the mint-an-account door. Required: the control is not decoration. */
  onNewAccount: () => void
  /** Enabling or disabling one account. The caller owns the roster. */
  onState: (id: string, state: AccountTableRow['state']) => void
  /** Ends every session one account holds. Absent draws no such row. */
  onEndSessions?: ((id: string) => void) | undefined
  /**
   * Ends every session the install holds, once the analyst has confirmed.
   * Absent draws no such control.
   *
   * The dialog waits on what this resolves, so a caller that returns its write
   * gets the held confirm; one that returns nothing closes immediately.
   */
  onEndEverySession?: (() => void | Promise<void>) | undefined
  /** The roles this install offers, for the row's role rows. */
  roles?: readonly string[] | undefined
  /** Moves an account to a role. Absent draws no role rows. */
  onRole?: ((id: string, role: string) => void) | undefined
}

export function AccountsPane({
  accounts,
  onNewAccount,
  onState,
  onEndSessions,
  onEndEverySession,
  roles,
  onRole,
}: AccountsPaneProps) {
  const [sweeping, setSweeping] = useState(false)
  const [ending, setEnding] = useState(false)

  // **Closed on settle, not on the press.** Ending every session is a sweep
  // over as many sessions as the install holds, and a dialog that closes the
  // moment it is confirmed shows the analyst nothing while it runs.
  async function endEverySession() {
    setEnding(true)
    try {
      await onEndEverySession?.()
    } finally {
      setEnding(false)
      setSweeping(false)
    }
  }

  return (
    <Section
      title="Accounts"
      meta={
        accounts.length === 0 ? undefined : (
          <span className="text-xs text-ink-muted">{accountCountLine(accounts)}</span>
        )
      }
      actions={
        <>
          {onEndEverySession && (
            // Not `destructive`: the act is deliberate rather than a mistake to
            // warn against, and the sentence it opens is where the cost is said.
            <Button
              variant="outline"
              size="sm"
              onPress={() => {
                setSweeping(true)
              }}
            >
              End every session
            </Button>
          )}
          <Button variant="outline" size="sm" onPress={onNewAccount}>
            New account
          </Button>
        </>
      }
    >
      {/* **The cost is said before it is paid.** Ending every session signs the
          administrator out with everybody else, which is the requirement read
          literally rather than a surprise to find afterwards. */}
      <AlertDialog
        isOpen={sweeping}
        onOpenChange={setSweeping}
        tone="destructive"
        title="End every session?"
        consequence="Every analyst is signed out, including you. Anybody can sign back in."
        confirmLabel="End every session"
        isPending={ending}
        onConfirm={() => {
          void endEverySession()
        }}
        onCancel={() => {
          setSweeping(false)
        }}
      />
      <AccountTable
        accounts={accounts}
        onState={onState}
        {...(onEndSessions ? { onEndSessions } : {})}
        {...(roles ? { roles } : {})}
        {...(onRole ? { onRole } : {})}
      />
    </Section>
  )
}

import { AccountTable, accountCountLine, type AccountRow } from '@/components/blocks/account-table'
import { Section } from '@/components/blocks/section'
import { Button } from '@/components/ui/button'

export interface AccountsPaneProps {
  accounts: readonly AccountRow[]
  /** Opens the mint-an-account door. Required: the control is not decoration. */
  onNewAccount: () => void
  /** Enabling or disabling one account. The caller owns the roster. */
  onState: (id: string, state: AccountRow['state']) => void
}

/** Who may sign in, and what each may reach. */
export function AccountsPane({ accounts, onNewAccount, onState }: AccountsPaneProps) {
  return (
    <Section
      title="Accounts"
      meta={
        accounts.length === 0 ? undefined : (
          <span className="text-xs text-ink-muted">{accountCountLine(accounts)}</span>
        )
      }
      actions={
        <Button variant="outline" size="sm" onPress={onNewAccount}>
          New account
        </Button>
      }
    >
      <AccountTable accounts={accounts} onState={onState} />
    </Section>
  )
}

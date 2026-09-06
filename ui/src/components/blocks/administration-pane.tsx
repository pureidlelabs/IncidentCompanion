import { ArrowUpRight } from 'lucide-react'

import { AccountTable, type AccountRow } from '@/components/blocks/account-table'
import { AbsentRow, SettingsRow, SettingsSection } from '@/components/blocks/settings-section'
import { Button } from '@/components/ui/button'
import { ListBoxItem } from '@/components/ui/list-box'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import {
  type AbsentSetting,
  type BoundRow,
  type RegimeRow,
} from './picker-rows'
import { Section } from './section'

export interface AdministrationPaneProps {
  accounts: readonly AccountRow[]
  /** Enabling or disabling one account. The caller owns the roster. */
  onAccountState: (id: string, state: AccountRow['state']) => void
  /** How long each kind of record is kept. */
  audit: readonly BoundRow[] | undefined
  /** The regimes this install surfaces, and whether each is on. */
  regimes: readonly RegimeRow[] | undefined
  /** What sign-in demands, and how long it stands. */
  signIn: readonly BoundRow[] | undefined
  /** What the server rate-limits, and at what. */
  limits: readonly BoundRow[] | undefined
  /** Sign-in settings this install cannot offer, each with its reason. */
  absentSignIn: readonly AbsentSetting[] | undefined
  absentForwarding: readonly AbsentSetting[] | undefined
}

export function AdministrationPane({
  accounts,
  onAccountState,
  audit: auditGiven,
  regimes: regimesGiven,
  signIn: signInGiven,
  limits: limitsGiven,
  absentSignIn: absentSignInGiven,
  absentForwarding: absentForwardingGiven,
}: AdministrationPaneProps) {
  const audit = auditGiven ?? []
  const regimes = regimesGiven ?? []
  const signIn = signInGiven ?? []
  const limits = limitsGiven ?? []
  const absentSignIn = absentSignInGiven ?? []
  const absentForwarding = absentForwardingGiven ?? []
  return (
    <Section title="Administration" blurb="What this installation is set to, and who may reach it.">
      <div className="flex flex-col gap-5">
        <SettingsSection
          title="Audit [soon]"
          summary="What is kept about this installation, and for how long. Not yet settable."
        >
          {audit.map((bound) => (
            <BoundSetting key={bound.id} bound={bound} width="w-full" />
          ))}
          <SettingsRow label="Activity log">
            <Button variant="outline" size="sm" className="w-fit" isDisabled>
              Open the log [soon]
              <ArrowUpRight aria-hidden className="size-4" />
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title="Compliance [soon]"
          summary="Which regimes a case is assessed against. Set them on a case's Compliance section."
        >
          {regimes.map((regime) => (
            <SettingsRow key={regime.id} label={regime.label} htmlFor={`regime-${regime.id}`}>
              <Switch id={`regime-${regime.id}`} isSelected={regime.on} isDisabled />
            </SettingsRow>
          ))}
        </SettingsSection>

        <SettingsSection
          title="Accounts"
          summary="Who may sign in, how they get in, and what each may reach."
        >
          {/* The same table the Accounts pane draws, without its heading. A
              settings card that grew its own would be the second one. */}
          <div className="px-4 py-4">
            <AccountTable accounts={accounts} onState={onAccountState} />
          </div>
        </SettingsSection>

        <SettingsSection title="Sign-in">
          {signIn.map((bound) => (
            <BoundSetting key={bound.id} bound={bound} width="w-56" />
          ))}
          {absentSignIn.map((absent) => (
            <AbsentRow key={absent.label} label={absent.label} description={absent.description} />
          ))}
        </SettingsSection>

        <SettingsSection title="Limits">
          {limits.map((bound) => (
            <BoundSetting key={bound.id} bound={bound} width="w-56" />
          ))}
        </SettingsSection>

        <SettingsSection
          title="Forwarding [soon]"
          summary="Where activity goes beyond this installation. Not yet settable."
        >
          {absentForwarding.map((absent) => (
            <AbsentRow key={absent.label} label={absent.label} description={absent.description} />
          ))}
        </SettingsSection>
      </div>
    </Section>
  )
}

/**
 * One bounded setting: a name, a line under it, and the choices the server allows.
 *
 * **Unselectable unless the row says where a choice goes.** Most of these have
 * no route to write them yet, and a select that moved would report a change
 * this install cannot keep.
 */
function BoundSetting({ bound, width }: { bound: BoundRow; width: string }) {
  const onChoose = bound.onChoose
  return (
    <SettingsRow
      label={bound.label}
      {...(bound.description === undefined ? {} : { description: bound.description })}
    >
      <Select
        aria-label={bound.label}
        isDisabled={onChoose === undefined}
        selectedKey={bound.chosen}
        className={width}
        items={bound.choices.map((choice) => ({ id: choice }))}
        {...(onChoose
          ? {
              // Spelled out rather than taken as the kit's `Key`: only
              // `components/ui/` imports react-aria-components.
              // -> kit-owns-the-primitives
              onSelectionChange: (key: string | number | null) => {
                if (key !== null) onChoose(String(key))
              },
            }
          : {})}
      >
        {(choice: { id: string }) => <ListBoxItem id={choice.id}>{choice.id}</ListBoxItem>}
      </Select>
    </SettingsRow>
  )
}

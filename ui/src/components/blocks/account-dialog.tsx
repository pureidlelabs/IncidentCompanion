import {
  AccountProfileSection,
  type AccountProfileWrites,
} from '@/components/blocks/account-profile-section'
import { PasswordChangeSection } from '@/components/blocks/password-change-section'
import { AbsentRow, SettingsRow, SettingsSection } from '@/components/blocks/settings-section'
import { Section } from '@/components/blocks/section'
import { Dialog, DialogBody } from '@/components/ui/dialog'
import { ListBoxItem } from '@/components/ui/list-box'
import { Select } from '@/components/ui/select'

/**
 * The analyst's own account: how they are drawn on a case, and how they sign in.
 */
export interface AccountPanelProps {
  /** How the analyst is named on a case. */
  name?: string
  /** Which presence tone is chosen. `undefined` is automatic. */
  tone?: 0 | 1 | 2
  /** The two characters drawn when no picture has loaded. */
  initials?: string
  /** Whether a picture has been stored. */
  hasPicture?: boolean
  /** The server's words for a picture it would not store. */
  pictureRefusal?: string
  /** Omitted in the gallery, where a profile choice is held and sent nowhere. */
  profileWrites?: AccountProfileWrites
  /** The chosen ground: `'light'`, `'dark'` or `'system'`. */
  ground?: string
  /** Fires with the ground's new value. */
  onGroundChange?: (ground: string) => void
  /** The server's words for a password change it refused. */
  passwordRefusal?: string
  /** The last change went through. */
  passwordChanged?: boolean
  /** Replaces the password once the three fields agree. */
  onChangePassword?: ((change: { current: string; password: string }) => void) | undefined
}

/** The grounds the app offers, and what each is called. */
const GROUNDS: readonly { value: string; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match the system' },
]

export function AccountPanel({
  name = 'r.okonkwo',
  tone,
  initials = '',
  hasPicture = false,
  pictureRefusal,
  profileWrites,
  ground = 'system',
  onGroundChange,
  passwordRefusal,
  passwordChanged = false,
  onChangePassword,
}: AccountPanelProps) {
  return (
    <Section
      measure="form"
      title="Your account"
      blurb="How you are drawn on a case, and how you sign in."
    >
      <div className="flex flex-col gap-5">
        <AccountProfileSection
          name={name}
          {...(tone === undefined ? {} : { tone })}
          initials={initials}
          hasPicture={hasPicture}
          {...(pictureRefusal === undefined ? {} : { pictureRefusal })}
          {...(profileWrites ? { writes: profileWrites } : {})}
        />

        <SettingsSection title="Appearance">
          <SettingsRow label="Ground">
            <Select
              aria-label="Ground"
              className="w-56"
              selectedKey={ground}
              onSelectionChange={(key) => {
                onGroundChange?.(String(key))
              }}
            >
              {GROUNDS.map((one) => (
                <ListBoxItem key={one.value} id={one.value}>
                  {one.label}
                </ListBoxItem>
              ))}
            </Select>
          </SettingsRow>
        </SettingsSection>

        <PasswordChangeSection
          refusal={passwordRefusal}
          changed={passwordChanged}
          {...(onChangePassword ? { onChangePassword } : {})}
        />

        {/* **Two sections, because these are two different things.** An
            authenticator app *adds* a factor to a password. Entra ID *replaces*
            it -- the tenant authenticates the analyst and this install trusts
            the result -- so filing it under a second factor said the opposite
            of what it does. */}
        <SettingsSection title="Second factor">
          <AbsentRow
            label="Authenticator app"
            description="One-time codes, set up on this screen."
          />
        </SettingsSection>

        <SettingsSection title="Single sign-on">
          <AbsentRow
            label="Microsoft Entra ID"
            description="Your own tenant signs the analyst in, instead of a password here."
          />
        </SettingsSection>
      </div>
    </Section>
  )
}

/**
 * The account screen as the app opens it: over whatever the analyst is on,
 * from the rail's own user menu.
 */
export interface AccountDialogProps extends AccountPanelProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function AccountDialog({ isOpen, onOpenChange, ...screen }: AccountDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="form"
      dialogProps={{ 'aria-label': 'Your account' }}
    >
      <DialogBody>
        <AccountPanel {...screen} />
      </DialogBody>
    </Dialog>
  )
}

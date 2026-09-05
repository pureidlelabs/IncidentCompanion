import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { SettingsRow, SettingsSection } from '@/components/blocks/settings-section'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'

export interface PasswordChangeSectionProps {
  /** The server's words for a password change it refused. */
  refusal?: string | undefined
  /** The last change went through. */
  changed?: boolean
  /** Replaces the password once the three fields agree. */
  onChangePassword?: ((change: { current: string; password: string }) => void) | undefined
}

/**
 * Replace your own password.
 *
 * The three fields carry no length hint: the shortest password is an install
 * policy on an admin-only route, and a wrong guess is worse than the server's
 * own refusal.
 */
export function PasswordChangeSection({
  refusal,
  changed = false,
  onChangePassword,
}: PasswordChangeSectionProps) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  /** What this screen refused, which the server's own answer outranks. */
  const [refused, setRefused] = useState('')
  const ready = current !== '' && next !== '' && repeat !== ''
  const shown = refusal ?? (refused || undefined)

  return (
    <SettingsSection title="Password">
      {changed && (
        <SettingsRow label="Changed">
          <Alert variant="success">
            <AlertTitle>Your password is replaced</AlertTitle>
            <AlertDescription>Your other sessions keep running.</AlertDescription>
          </Alert>
        </SettingsRow>
      )}
      {shown !== undefined && (
        <SettingsRow label="Refused">
          <Alert variant="destructive">
            <AlertTitle>The password was not changed</AlertTitle>
            <AlertDescription>{shown}</AlertDescription>
          </Alert>
        </SettingsRow>
      )}
      <SettingsRow label="Current password">
        <TextField
          aria-label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          className="w-72"
        />
      </SettingsRow>
      <SettingsRow label="New password">
        <TextField
          aria-label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={setNext}
          className="w-72"
        />
      </SettingsRow>
      <SettingsRow label="Repeat the new password">
        <TextField
          aria-label="Repeat the new password"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={setRepeat}
          isInvalid={repeat !== '' && repeat !== next}
          errorMessage="The passwords do not match"
          className="w-72"
        />
      </SettingsRow>
      <SettingsRow label="">
        <Button
          variant="default"
          className="w-fit"
          isDisabled={!ready}
          onPress={() => {
            if (repeat !== next) {
              setRefused('The passwords do not match.')
              return
            }
            if (next === current) {
              setRefused('Choose a password you have not used here.')
              return
            }
            setRefused('')
            onChangePassword?.({ current, password: next })
          }}
        >
          <KeyRound aria-hidden />
          Change password
        </Button>
      </SettingsRow>
    </SettingsSection>
  )
}

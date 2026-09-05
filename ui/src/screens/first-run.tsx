import { useState } from 'react'

import { AuthCorner } from '@/components/blocks/auth-corner'
import { AuthForm } from '@/components/blocks/auth-form'
import { AuthFrame } from '@/components/blocks/auth-frame'
import { AUTH_MARK } from '@/components/blocks/auth-masthead'
import { AuthNotice } from '@/components/blocks/auth-notice'
import { NewPasswordPair } from '@/components/blocks/new-password-pair'
import { TextField } from '@/components/ui/text-field'


/**
 * First run: whoever holds the setup token creates the install's first admin.
 */
export interface FirstRunScreenProps {
  /** The server's own words for a refused claim. */
  refusal?: string
  /** The submit is working. */
  busy?: boolean
  /** What the token box opens with. */
  token?: string
  /** A complete form, handed to whoever claims the install. */
  onSubmit?: ((claim: { token: string; username: string; password: string }) => void) | undefined
}

/** The shortest password this install accepts, which the field also states. */
const PASSWORD_FLOOR = 12

export function FirstRunScreen({
  refusal,
  busy = false,
  token = '',
  onSubmit,
}: FirstRunScreenProps) {
  const [setupToken, setSetupToken] = useState(token)
  const [username, setUsername] = useState('')
  const [secret, setSecret] = useState('')
  const [repeat, setRepeat] = useState('')
  /** What this screen refused, which the server's own answer outranks. */
  const [refused, setRefused] = useState('')
  const shown = refusal ?? (refused || undefined)

  /**
   * The first thing wrong the repeat field cannot already say, or nothing.
   */
  const wrong = (): string => {
    if (!setupToken.trim()) return 'Enter the setup token printed at startup.'
    if (!username.trim()) return 'Enter a username.'
    if (secret.length < PASSWORD_FLOOR)
      return `Use at least ${String(PASSWORD_FLOOR)} characters for the password.`
    if (repeat === '') return 'The passwords do not match.'
    return ''
  }

  return (
    <AuthFrame
      mark={AUTH_MARK}
      title="Set up IncidentCompanion"
      lede="Nobody has claimed this install yet."
      corner={<AuthCorner />}
    >
      <AuthForm
        isPending={busy}
        submit="Create account"
        pending={'Creating account\u2026'}
        onSubmit={() => {
          const problem = wrong()
          setRefused(problem)
          if (problem) return
          // A typed, disagreeing repeat: the field already shows it, so this
          // gates the submit without a second alert saying the same thing.
          if (repeat !== secret) return
          onSubmit?.({ token: setupToken, username, password: secret })
        }}
      >
        {/* One alert, above the fields: a refused claim can be about the token,
            the two passwords disagreeing, or the password's length, and hanging
            all three under the last field points at the wrong one twice out of
            three times. */}
        {shown !== undefined && (
          <AuthNotice variant="destructive" title="This install was not claimed" description={shown} />
        )}

        <TextField
          label="Setup token"
          name="token"
          isRequired
          autoComplete="off"
          description="Printed to the console at startup, and readable in the app folder."
          value={setupToken}
          onChange={setSetupToken}
        />

        <TextField
          label="Username"
          name="username"
          isRequired
          autoComplete="username"
          value={username}
          onChange={setUsername}
        />

        <NewPasswordPair
          newLabel="Password"
          repeatLabel="Repeat password"
          repeatDescription={`At least ${String(PASSWORD_FLOOR)} characters.`}
          secret={secret}
          onSecretChange={setSecret}
          repeat={repeat}
          onRepeatChange={setRepeat}
        />
      </AuthForm>
    </AuthFrame>
  )
}

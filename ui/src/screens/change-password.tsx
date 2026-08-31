import { useState } from 'react'

import { AuthCorner } from '@/components/blocks/auth-corner'
import { AuthForm } from '@/components/blocks/auth-form'
import { AuthFrame } from '@/components/blocks/auth-frame'
import { AUTH_MARK } from '@/components/blocks/auth-masthead'
import { AuthNotice } from '@/components/blocks/auth-notice'
import { NewPasswordPair } from '@/components/blocks/new-password-pair'
import { PasswordField } from '@/components/ui/password-field'


/**
 * Where an account whose password somebody else chose is held until it picks
 * its own.
 *
 * The account is signed in and this is the only screen it can reach: the
 * server refuses it at every other route, so the hold is enforced there and
 * this is where the analyst is sent rather than what stops them.
 *
 * The current password is asked for again seconds after it was typed to get
 * here, because one function replaces a credential for both the forced flow
 * and the self-service one.
 *
 * **What the screen can judge, it judges**: a missing field, a new password
 * that repeats the old one, two that disagree. A complete form goes to
 * `onSubmit`, which is whoever performs the change.
 */
export interface ChangePasswordScreenProps {
  /** The server's own words for a refused change. */
  refusal?: string
  /** The submit is working. */
  busy?: boolean
  /** Draw the standing reason above the fields. */
  forced?: boolean
  /** A complete form, handed to whoever performs the change. */
  onSubmit?: ((change: { current: string; password: string }) => void) | undefined
}

export function ChangePasswordScreen({
  refusal,
  busy = false,
  forced = true,
  onSubmit,
}: ChangePasswordScreenProps) {
  const [current, setCurrent] = useState('')
  const [secret, setSecret] = useState('')
  const [repeat, setRepeat] = useState('')
  /** What this screen refused, which the server's own answer outranks. */
  const [refused, setRefused] = useState('')
  const shown = refusal ?? (refused || undefined)

  /**
   * The first thing wrong the repeat field cannot already say, or nothing.
   *
   * **A blank repeat is the one shape the field's own `isInvalid` never
   * marks** - it only fires once the two disagree, so this is where that gap
   * is closed. A typed, disagreeing repeat is left to the field: showing it
   * here too would put the same sentence on screen twice.
   */
  const wrong = (): string => {
    if (current === '' || secret === '') return 'Fill in both passwords.'
    if (secret === current) return 'Choose a password you have not used here.'
    if (repeat === '') return 'The passwords do not match.'
    return ''
  }

  return (
    <AuthFrame
      mark={AUTH_MARK}
      title="Choose a password"
      lede="Your password was set by somebody else. Choose your own to continue."
      corner={<AuthCorner />}
    >
      <div className="flex flex-col gap-4">
        {forced && (
          <AuthNotice
            variant="warning"
            title="Your password was set by someone else"
            description="No case is reachable until you set your own."
          />
        )}

        {shown !== undefined && <AuthNotice variant="destructive" title={shown} />}

        <AuthForm
          isPending={busy}
          submit="Change password"
          pending={'Changing password\u2026'}
          onSubmit={() => {
            const problem = wrong()
            setRefused(problem)
            if (problem) return
            // A typed, disagreeing repeat: the field already shows it, so
            // this gates the submit without a second alert saying the same
            // thing.
            if (repeat !== secret) return
            onSubmit?.({ current, password: secret })
          }}
        >
          <PasswordField
            label="Current password"
            name="current"
            isRequired
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
          />
          <NewPasswordPair
            newLabel="New password"
            repeatLabel="Repeat new password"
            secret={secret}
            onSecretChange={setSecret}
            repeat={repeat}
            onRepeatChange={setRepeat}
          />
        </AuthForm>
      </div>
    </AuthFrame>
  )
}

import { useState } from 'react'

import { AuthBeats } from '@/components/blocks/auth-atmosphere'
import { AuthCorner } from '@/components/blocks/auth-corner'
import { AuthForm } from '@/components/blocks/auth-form'
import { SsoSignIn, type SsoProvider } from '@/components/blocks/sso-sign-in'
import { AuthFrame } from '@/components/blocks/auth-frame'
import { AUTH_MARK } from '@/components/blocks/auth-masthead'
import { AuthNotice } from '@/components/blocks/auth-notice'
import { PasswordField } from '@/components/ui/password-field'
import { TextField } from '@/components/ui/text-field'

/**
 * The screen every deployment opens on.
 *
 * **One refusal, above the form and not under a field.** The server folds
 * unknown, wrong, disabled and locked-out into one answer so the screen cannot
 * be used to enumerate who works here; hanging that under Password names one
 * field as the culprit when the address is as likely to be what was wrong.
 *
 * **The screen judges what it can see and the caller judges the rest.** An
 * incomplete form is refused here, in the same band the server's answer would
 * land in, because that is a refusal no exchange is needed to make. `onSubmit`
 * is what a complete form goes to; without one, this screen has nowhere to
 * send it and says so nowhere - the form simply stays as it is.
 *
 * The corner cluster renders after the form in the DOM, so the first tab stop
 * is the credential rather than the ground switch.
 */
export interface SignInScreenProps {
  /** What the address box opens with. */
  email?: string
  /** The server's own words for a refused sign-in. Drawn above the form. */
  refusal?: string
  /** The submit is working. */
  busy?: boolean
  /** A complete form, handed to whoever performs the sign-in. */
  onSubmit?: ((credential: { email: string; password: string }) => void) | undefined
  /**
   * The directories this install accepts a sign-in from, above the form.
   *
   * Empty is the install with local passwords only, which draws no providers
   * and no rule.
   */
  providers?: readonly SsoProvider[]
  /** No local passwords: the providers are the whole door, and the rule goes. */
  soleMeans?: boolean
}

/** The two lines the wide pane carries, in the order it says them. */
const ATMOSPHERE = [
  'Untangling the intrusion is the hard part.',
  'The report shouldn\u2019t be.',
]

export function SignInScreen({
  email = '',
  refusal,
  busy = false,
  onSubmit,
  providers = [],
  soleMeans = false,
}: SignInScreenProps) {
  const [address, setAddress] = useState(email)
  const [secret, setSecret] = useState('')
  /**
   * The server's answer, and only the server's.
   *
   * React Aria refuses an incomplete form per field, so the banner carries the
   * one refusal that names no field by design rather than a second message
   * about what was left blank.
   */
  const shown = refusal

  return (
    <AuthFrame
      mark={AUTH_MARK}
      title="Sign in to IncidentCompanion"
      lede="Welcome back."
      atmosphere={<AuthBeats lines={ATMOSPHERE} />}
      corner={<AuthCorner />}
    >
      <SsoSignIn providers={providers} soleMeans={soleMeans} />
      {/* An install with no local passwords draws no password box.
          The rule and the form go together: one without the other is
          a door with a divider and nothing on the far side. */}
      {/* **`native`, against the kit's `aria` default.** The kit defaults to
          advice, which marks a field and lets the submit through; an empty
          credential is a refusal, so this is one of the places a caller opts
          into the platform gating it. React Aria then refuses per field and
          names each one -- the banner this replaces named neither. */}
      {soleMeans ? null : (
      <AuthForm
        validationBehavior="native"
        gap="roomy"
        isPending={busy}
        submit="Sign in"
        pending={'Signing in\u2026'}
        recovery="An administrator resets a password you cannot produce."
        onSubmit={() => {
          onSubmit?.({ email: address, password: secret })
        }}
      >
        {shown !== undefined && (
          <AuthNotice variant="destructive" title="That sign-in was refused" description={shown} />
        )}

        <TextField
          label="Email"
          // The name is what a server error keys on, and what the browser
          // reports the field as when it refuses one.
          name="email"
          type="email"
          isRequired
          // The opt-in has to be explicit: the kit's field suppresses a password
          // manager everywhere else, and these two are what one is for.
          autoComplete="email"
          value={address}
          onChange={setAddress}
        />

        <PasswordField
          label="Password"
          name="password"
          isRequired
          autoComplete="current-password"
          value={secret}
          onChange={setSecret}
        />
      </AuthForm>
      )}
    </AuthFrame>
  )
}

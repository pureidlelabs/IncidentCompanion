import { useState } from 'react'

import { signIn } from '@/api/client'
import { SignInScreen } from '@/screens/sign-in'

import { refusalOf } from './refusal'

/**
 * `SignInScreen` bound to the call that signs somebody in.
 *
 * @param onMustChangePassword - the account is signed in and reaches exactly
 * one route. `signIn` writes no identity in that case, so the caller has to be
 * told rather than reading it off the session.
 */
export function SignInContainer({
  onMustChangePassword,
}: {
  onMustChangePassword: () => void
}) {
  const [refusal, setRefusal] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  return (
    <SignInScreen
      {...(refusal === undefined ? {} : { refusal })}
      busy={busy}
      onSubmit={({ email, password }) => {
        // Cleared as the attempt starts, not when its answer arrives: the
        // previous refusal otherwise stands over a submit that is already in
        // flight, and reads as the server's answer to this one.
        setRefusal(undefined)
        setBusy(true)
        signIn(email, password)
          .then(({ mustChangePassword }) => {
            if (mustChangePassword) onMustChangePassword()
          })
          .catch((error: unknown) => {
            setRefusal(refusalOf(error))
          })
          .finally(() => {
            setBusy(false)
          })
      }}
    />
  )
}

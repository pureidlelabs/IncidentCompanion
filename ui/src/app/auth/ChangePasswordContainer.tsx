import { useState } from 'react'

import { changeOwnPassword } from '@/api/client'
import { ChangePasswordScreen } from '@/screens/change-password'

import { refusalOf } from './refusal'

/**
 * `ChangePasswordScreen` bound to the call that replaces the credential.
 *
 * @param onChanged - the hold is released. It is the caller's state, set from
 * the boot probe and from the sign-in answer, and neither of those is asked
 * again after a change - so a container that does not report the success
 * leaves the analyst on this screen with the password already replaced.
 */
export function ChangePasswordContainer({ onChanged }: { onChanged: () => void }) {
  const [refusal, setRefusal] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  return (
    <ChangePasswordScreen
      {...(refusal === undefined ? {} : { refusal })}
      busy={busy}
      onSubmit={({ current, password }) => {
        setRefusal(undefined)
        setBusy(true)
        changeOwnPassword({ current, password, repeat: password })
          .then(() => {
            onChanged()
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

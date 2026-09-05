import { useState } from 'react'

import { claimInstall } from '@/api/client'
import { FirstRunScreen } from '@/screens/first-run'

import { refusalOf } from './refusal'

/**
 * `FirstRunScreen` bound to the call that claims the install.
 *
 * Nothing is reported on success: `claimInstall` signs in as the account it
 * just made and writes the identity, and the caller re-renders off that.
 *
 * **`repeat` is filled from the password the screen kept.** The route parses a
 * body carrying both and the screen's `onSubmit` carries one - it judges the
 * two against each other itself and hands over the value, so the agreement the
 * server re-checks is one the analyst has already made.
 */
export function FirstRunContainer() {
  const [refusal, setRefusal] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  return (
    <FirstRunScreen
      {...(refusal === undefined ? {} : { refusal })}
      busy={busy}
      onSubmit={({ token, username, password }) => {
        setRefusal(undefined)
        setBusy(true)
        claimInstall({ token, username, password, repeat: password })
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

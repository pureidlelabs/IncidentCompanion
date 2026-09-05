import { useState } from 'react'

import { claimInstall } from '@/api/client'
import { FirstRunScreen } from '@/screens/first-run'

import { refusalOf } from './refusal'

/**
 * `FirstRunScreen` bound to the call that claims the install.
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

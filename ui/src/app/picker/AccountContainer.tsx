import { useState } from 'react'

import {
  useAppearances,
  useClearAvatar,
  useSetAppearance,
  useUploadAvatar,
} from '@/api/appearance'
import { changeOwnPassword } from '@/api/client'
import { announced, announcing } from '@/app/case/entryWrites'
import type { AccountProfileWrites } from '@/components/blocks/account-profile-section'
import { useSession } from '@/api/useSession'
import { useGround } from '@/lib/useGround'
import type { Theme } from '@/lib/theme-preference'
import { AccountDialog } from '@/components/blocks/account-dialog'

import { refusalOf } from '../auth/refusal'

/**
 * What a refused profile write says, since the default subject-verb fits none
 * of the three: the initials are plural, and removing a picture is not saving
 * one.
 */
const REFUSED = {
  tone: 'The colour was not saved.',
  initials: 'The initials were not saved.',
  picture: 'The picture was not removed.',
} as const

/**
 * The account dialog, bound to the analyst's own appearance, ground and
 * password. The rail's user menu opens it, over whatever they are on.
 *
 * **Read by id, not by name.** `useAppearances` keys its roster the same way
 * the presence chips do, since a display name is not unique and a name-keyed
 * lookup hands two analysts called Sam each other's colour, initials and
 * face.
 *
 * Colour and initials write through `useSetAppearance`, which is a partial
 * patch -- so each write carries the other field's current value, or the
 * write would ask the server to clear it.
 */
export function AccountContainer({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const session = useSession()
  const appearances = useAppearances()
  const upload = useUploadAvatar()
  const clear = useClearAvatar()
  const save = useSetAppearance()
  const { theme, setTheme } = useGround()

  const [pictureRefusal, setPictureRefusal] = useState<string | undefined>(undefined)
  const [passwordRefusal, setPasswordRefusal] = useState<string | undefined>(undefined)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)

  const name = session?.username ?? 'signed out'
  const mine = session ? appearances.data?.get(session.userId) : undefined

  // The refusal is about one attempt against the picture then served, so a
  // write that moves the served version has already answered it.
  const [servedPicture, setServedPicture] = useState(mine?.avatarVersion)
  if (servedPicture !== mine?.avatarVersion) {
    setServedPicture(mine?.avatarVersion)
    setPictureRefusal(undefined)
  }

  const writes: AccountProfileWrites = {
    setPicture: (file) => {
      setPictureRefusal(undefined)
      upload.mutate(file, {
        onError: (error) => {
          setPictureRefusal(refusalOf(error))
        },
      })
    },
    clearPicture: () => {
      void announced('the picture', () => clear.mutateAsync(), { said: REFUSED.picture })
    },
    // Awaited rather than voided: `announcing` rethrows, and the rejection is
    // what puts the control back.
    setTone: async (tone) => {
      await announcing(
        'the colour',
        () => save.mutateAsync({ tone, initials: mine?.initials ?? '' }),
        { said: REFUSED.tone },
      )
    },
    setInitials: async (initials) => {
      await announcing(
        'the initials',
        () => save.mutateAsync({
          ...(mine?.tone !== undefined ? { tone: mine.tone } : {}),
          initials,
        }),
        { said: REFUSED.initials },
      )
    },
  }

  return (
    <AccountDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      name={name}
      {...(mine?.tone !== undefined ? { tone: mine.tone as 0 | 1 | 2 } : {})}
      initials={mine?.initials ?? ''}
      hasPicture={mine?.avatarVersion !== undefined}
      {...(pictureRefusal === undefined ? {} : { pictureRefusal })}
      profileWrites={writes}
      ground={theme}
      onGroundChange={(next) => {
        setTheme(next as Theme)
      }}
      {...(passwordRefusal === undefined ? {} : { passwordRefusal })}
      passwordChanged={passwordChanged}
      passwordBusy={passwordBusy}
      onChangePassword={({ current, password }) => {
        setPasswordRefusal(undefined)
        setPasswordChanged(false)
        setPasswordBusy(true)
        changeOwnPassword({ current, password, repeat: password })
          .then(() => {
            setPasswordChanged(true)
          })
          .catch((error: unknown) => {
            setPasswordRefusal(refusalOf(error))
          })
          // Cleared however it answered: a refusal has to leave the analyst
          // able to correct the password and send it again.
          .finally(() => {
            setPasswordBusy(false)
          })
      }}
    />
  )
}

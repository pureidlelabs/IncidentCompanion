import { ShieldCheck, UserRound, UserRoundPlus, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { PasswordField } from '@/components/ui/password-field'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { TextField } from '@/components/ui/text-field'

/**
 * What each role reaches, for the roles this app knows.
 *
 * **Nothing enumerates the roles**: the list is the server's, and one it grows
 * draws its own name and no sentence rather than disappearing from the form.
 */
const ROLE_ROWS: Record<string, { detail: string; icon: LucideIcon }> = {
  analyst: { detail: 'Every case.', icon: UserRound },
  admin: { detail: 'Every case, plus accounts and installation settings.', icon: ShieldCheck },
}

/** What `POST /api/accounts` takes. Spelled the wire's way, not camelised. */
export interface NewAccount {
  username: string
  display_name: string
  password: string
  role: string
}

export interface NewAccountDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The roles the server named.
   *
   * **Nothing enumerates them here**: a role the install grows draws its own
   * name rather than disappearing from the form.
   */
  roles: readonly string[]
  defaultRole: string
  /** Required, so the door cannot render with nothing behind it. */
  onCreate: (account: NewAccount) => void
  /** A write is in flight, so the create control is held. */
  isPending: boolean
  /** What the server said, when it refused. */
  problem?: string | undefined
}

/**
 * Mint an account, with a password its holder replaces at first sign-in.
 *
 * **The password is temporary and the header says so.** `POST /api/accounts`
 * puts a hold on the account, so whoever receives these credentials chooses
 * their own on the way in - which is the fact an administrator handing them
 * over needs, and is not visible from the form.
 */
export function NewAccountDialog({
  isOpen,
  onOpenChange,
  roles,
  defaultRole,
  onCreate,
  isPending,
  problem,
}: NewAccountDialogProps) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(defaultRole)
  // **The roster arrives after this mounts.** `useState` captures the first
  // `defaultRole`, which is `''` while `GET /api/accounts` is in flight -- so a
  // captured default leaves the role empty and the create route refuses the
  // account with *expected one of "analyst"|"admin"*. Adopt it when it lands,
  // the way `timeline.tsx` adopts a case that arrives late.
  const [seenDefault, setSeenDefault] = useState(defaultRole)
  if (seenDefault !== defaultRole) {
    setSeenDefault(defaultRole)
    setRole(defaultRole)
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="form"
      dialogProps={{ 'aria-label': 'New account' }}
    >
      <DialogHeader
        title="New account"
        description="The password below is temporary. They choose their own at first sign-in."
        onClose={() => {
          onOpenChange(false)
        }}
      />
      <DialogBody>
        {/* **The whole form is held, not just the submit.** Holding only the
            button leaves every field live: an analyst who edits the address
            after pressing Create gets an account made with the old value and a
            screen showing the new one, with nothing saying which was sent. */}
        <fieldset disabled={isPending} className="contents">
        <form
          id="new-account-form"
          // `size="form"` is the two-column archetype, and a field caps at
          // `--field-max` on purpose. One column left everything narrow beside
          // a role picker spanning the whole width.
          className="grid gap-x-6 gap-y-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            onCreate({ username, display_name: displayName, password, role })
          }}
        >
          {/* Email, because that is what an analyst signs in with: the
              credential account is keyed on the address, so a field labelled
              "Username" asks for one thing and refuses anything else. */}
          <TextField
            label="Email"
            type="email"
            autoComplete="off"
            isRequired
            value={username}
            onChange={setUsername}
          />
          <TextField label="Display name" value={displayName} onChange={setDisplayName} />
          <PasswordField
            label="Password"
            description="At least 12 characters."
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
          {/* `isDisabled` as well as the fieldset: a native `fieldset` reaches
              the hidden inputs React Aria proxies but not the controls it
              draws, so the group was unchangeable and still announced as
              enabled. */}
          <RadioGroup
            label="Role"
            isDisabled={isPending}
            variant="card"
            className="sm:col-start-2 sm:row-start-1 sm:row-span-3"
            value={role}
            onChange={setRole}
          >
            {roles.map((option) => {
              const known = ROLE_ROWS[option]
              const Icon = known?.icon
              return (
                <Radio
                  key={option}
                  value={option}
                  {...(known === undefined ? {} : { description: known.detail })}
                  {...(Icon === undefined ? {} : { icon: <Icon aria-hidden /> })}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Radio>
              )
            })}
          </RadioGroup>
          {problem !== undefined && (
            <p className="text-sm text-danger sm:col-span-2">{problem}</p>
          )}
        </form>
        </fieldset>
      </DialogBody>
      <DialogFooter>
        {/* Held too: dismissing mid-write leaves the account created and the
            analyst believing they cancelled it. */}
        <Button
          variant="outline"
          isDisabled={isPending}
          onPress={() => {
            onOpenChange(false)
          }}
        >
          Cancel
        </Button>
        {/* `form=` rather than nesting: the footer renders outside the form,
            and a submit button outside a form submits nothing. */}
        <Button
          type="submit"
          form="new-account-form"
          variant="default"
          isPending={isPending}
          pendingLabel="Creating"
        >
          <UserRoundPlus aria-hidden />
          Create account
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

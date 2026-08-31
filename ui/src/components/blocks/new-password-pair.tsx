import { PasswordField } from '@/components/ui/password-field'

export interface NewPasswordPairProps {
  /** Label on the first box. */
  newLabel: string
  /** Label on the second box. */
  repeatLabel: string
  /** One line under the repeat box, when the caller states a floor. */
  repeatDescription?: string | undefined
  secret: string
  onSecretChange: (value: string) => void
  repeat: string
  onRepeatChange: (value: string) => void
}

/**
 * Two `PasswordField`s asking for the same secret twice, wired to agree.
 *
 * **A blank repeat is never marked invalid.** `isInvalid` fires only once
 * both boxes hold something and disagree, so a repeat nobody has typed into
 * yet stays quiet -- the caller's own submit gate is where a blank repeat is
 * refused.
 */
export function NewPasswordPair({
  newLabel,
  repeatLabel,
  repeatDescription,
  secret,
  onSecretChange,
  repeat,
  onRepeatChange,
}: NewPasswordPairProps) {
  return (
    <>
      <PasswordField
        label={newLabel}
        name="password"
        isRequired
        autoComplete="new-password"
        value={secret}
        onChange={onSecretChange}
      />

      <PasswordField
        label={repeatLabel}
        name="repeat"
        isRequired
        autoComplete="new-password"
        description={repeatDescription}
        value={repeat}
        onChange={onRepeatChange}
        isInvalid={repeat !== '' && repeat !== secret}
        errorMessage="The passwords do not match"
      />
    </>
  )
}

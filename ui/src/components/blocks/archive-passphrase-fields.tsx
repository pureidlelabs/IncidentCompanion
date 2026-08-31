import { FormCell, FormSection } from '@/components/blocks/form-section'
import { TextField } from '@/components/ui/text-field'

/**
 * The two-field passphrase confirm for an archive export.
 *
 * **The confirm field is a client-side equality check only.** A mismatch
 * disables the export it sits under rather than refusing on the server, so a
 * mistyped passphrase is caught before the request rather than after the
 * download produces an archive nobody can ever open.
 */
export function ArchivePassphraseFields({
  secret,
  onSecret,
  repeat,
  onRepeat,
  mismatch,
}: {
  secret: string
  onSecret: (next: string) => void
  repeat: string
  onRepeat: (next: string) => void
  mismatch: boolean
}) {
  return (
    <FormSection title="Passphrase" columns={2}>
      <FormCell>
        <TextField
          label="Passphrase"
          type="password"
          // `new-password`, never `off`: a manager ignores `off` on a
          // password field by design, and offering the analyst's account
          // password here would encrypt an exportable archive with a
          // credential.
          autoComplete="new-password"
          description="Leave blank to export unencrypted."
          value={secret}
          onChange={onSecret}
        />
      </FormCell>
      <FormCell>
        <TextField
          label="Confirm passphrase"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={onRepeat}
          isInvalid={mismatch}
          errorMessage="The passphrases do not match"
        />
      </FormCell>
    </FormSection>
  )
}

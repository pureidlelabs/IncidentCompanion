import { useState } from 'react'

import { FileSlot } from '@/components/blocks/file-slot'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { TextField } from '@/components/ui/text-field'

/** Sending the archive. The caller navigates into the case it becomes. */
export interface ImportCaseWrites {
  start: (archive: { file: File; passphrase?: string }) => void
}

/**
 * Importing a `.iccase` archive, which becomes a new case.
 */
export interface ImportCaseScreenProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** The archive is in flight. */
  busy?: boolean
  /** What the server said, drawn against the passphrase field. */
  problem?: string | undefined
  writes?: ImportCaseWrites | undefined
}

export function ImportCaseScreen({
  isOpen,
  onOpenChange,
  busy = false,
  problem,
  writes,
}: ImportCaseScreenProps) {
  const [file, setFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="form"
      dialogProps={{ 'aria-label': 'Import a case archive' }}
    >
      <DialogHeader
        title="Import a case archive"
        description="The archive becomes a new case. Nothing already here is changed."
      />
      <DialogBody>
        <div className="flex flex-col gap-4">
          <FileSlot
            file={file}
            onFile={setFile}
            label="Drop a .iccase archive here"
            description="One archive, exported from this app or another install."
            choose="Choose an archive"
          />
          <TextField
            label="Passphrase"
            type="password"
            // `new-password`, never `off`: a manager ignores `off` on a
            // password field, and an unannotated one reads as a sign-in field,
            // so it offers the analyst's own account password.
            autoComplete="new-password"
            description="Only needed if the archive was exported encrypted."
            value={passphrase}
            onChange={setPassphrase}
            {...(problem === undefined ? {} : { isInvalid: true, errorMessage: problem })}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          onPress={() => {
            onOpenChange(false)
          }}
        >
          Cancel
        </Button>
        <Button
          // The gate is the file, not the browser: a `required` file input is
          // satisfied by a FileList jsdom will not validate.
          isDisabled={busy || file === null}
          onPress={() => {
            if (file === null) return
            writes?.start(passphrase === '' ? { file } : { file, passphrase })
          }}
        >
          {busy ? 'Importing\u2026' : 'Import'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

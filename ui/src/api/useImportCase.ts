/**
 * `POST /api/cases/import` - the picker's Import `.iccase` dialog.
 *
 * The archive is the request body and the passphrase an `x-archive-passphrase`
 * header, so this goes through `requestBody()` rather than `request()`.
 *
 * A wrong, missing or unwanted passphrase answers 422 with the message the
 * route wrote - the caller renders that inline rather than through the toast,
 * because the dialog is still open and the next step is retyping it.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { requestBody, type ApiError } from './client'
import { keys } from './queryKeys'

export interface ImportArchive {
  file: File
  passphrase?: string
}

/**
 * What `POST /api/cases/import` answers with.
 *
 * **A new case, always** - an archive is never written back over a live one,
 * so the id here is minted rather than the one the archive came from.
 * `missingFiles` is how many attachments the archive's rows name and it did
 * not carry, which for a handover export is all of them and is not a fault.
 */
export interface ImportedCase {
  id: string
  title: string
  rows: number
  attachments: 'included' | 'omitted'
  missingFiles: number
}

export function useImportCase(): UseMutationResult<ImportedCase, ApiError, ImportArchive> {
  const client = useQueryClient()

  return useMutation<ImportedCase, ApiError, ImportArchive>({
    mutationFn: ({ file, passphrase }) =>
      // The file is the body and the passphrase a header: one archive needs no
      // multipart envelope, and the server caps while reading the stream.
      requestBody<ImportedCase>(
        '/cases/import',
        file,
        { headers: passphrase ? { 'x-archive-passphrase': passphrase } : {} },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.cases() })
    },
  })
}

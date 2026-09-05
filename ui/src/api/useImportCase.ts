/**
 * `POST /api/cases/import` - the picker's Import `.iccase` dialog.
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

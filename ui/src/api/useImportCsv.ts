import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { requestBody, type ApiError } from './client'
import { keys } from './queryKeys'

import type { CollectionName } from './model'

/**
 * What the import route answers with.
 */
export interface Imported {
  added: number
  skipped: number
  replaced: number
  refused: number
}

/** One table's worth of rows, and what to do with a row that is already there. */
export interface CsvImport {
  collection: CollectionName
  file: File
  /** The server's default stands when this is absent. */
  onDuplicate?: string
}

/**
 * Add rows to one collection from a CSV.
 */
export function useImportCsv(caseId: string): UseMutationResult<Imported, ApiError, CsvImport> {
  const client = useQueryClient()
  return useMutation<Imported, ApiError, CsvImport>({
    mutationFn: ({ collection, file, onDuplicate }) =>
      requestBody<Imported>(
        `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}.csv${
          onDuplicate ? `?onDuplicate=${encodeURIComponent(onDuplicate)}` : ''
        }`,
        // The picker hands over whatever the file system called it, and a
        // `.csv` chosen on some systems arrives as `application/vnd.ms-excel`.
        // The route dispatches on the path, so the type is stated here.
        new File([file], file.name, { type: 'text/csv' }),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

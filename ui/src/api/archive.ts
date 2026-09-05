/**
 * `POST /api/cases/{id}/archive` - the case as a `.iccase`, out.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query'

import { type ApiError, requestBlob, type BlobResponse } from './client'
import { downloadBlob } from '@/lib/downloadBlob'

export type ArchiveResult = BlobResponse

/**
 * What the export screen asks for.
 */
export interface ArchiveOptions {
  passphrase?: string
  includeFiles?: boolean
}

export function useExportArchive(
  caseId: string,
): UseMutationResult<ArchiveResult, ApiError, ArchiveOptions> {
  return useMutation<ArchiveResult, ApiError, ArchiveOptions>({
    mutationFn: ({ passphrase = '', includeFiles = true }: ArchiveOptions) =>
      requestBlob(`/cases/${encodeURIComponent(caseId)}/archive`, {
        ...(passphrase ? { passphrase } : {}),
        includeFiles,
      }),
  })
}

/** `downloadBlob` takes `(blob, filename)` and every other caller has them
 *  as two values already; this is the one caller with them boxed in the
 *  mutation's own result shape. */
export function downloadArchive(result: ArchiveResult): void {
  downloadBlob(result.blob, result.filename)
}

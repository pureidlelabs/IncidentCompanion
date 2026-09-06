/**
 * `POST /api/cases/{id}/archive` - the case as a `.iccase`, out.
 *
 * **Goes through `client.ts::requestBlob`, not a `fetch` of its own.**
 * "A fetch anywhere outside `client.ts` is a defect" is that file's own
 * rule; the binary response (`application/octet-stream` on success, the
 * usual `{error}` JSON on refusal) is `requestBlob`'s one job, shared with
 * whatever else ever needs a downloaded response instead of a parsed one.
 *
 * **Exporting changes nothing about the case**, which is why the route asks
 * no more reach than reading it: `archive.controller.ts` mounts the export
 * under `CaseAccessGuard` and names no level.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query'

import { type ApiError, requestBlob, type BlobResponse } from './client'
import { downloadBlob } from '@/lib/downloadBlob'

export type ArchiveResult = BlobResponse

/**
 * What the export screen asks for.
 *
 * **`includeFiles` defaults to true because an archive is usually a backup.**
 * Leaving the attachments out makes it a handover - small enough to send to a
 * customer or a regulator, and not carrying the incident's own artefacts out
 * of the building. The manifest records which was chosen, so an import can
 * tell a deliberate handover from a backup somebody damaged.
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

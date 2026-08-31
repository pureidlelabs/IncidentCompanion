/**
 * A record and its bytes: `POST .../evidence`, then `POST .../evidence/{id}/file`.
 *
 * **Two requests, and that is the shape rather than a compromise.** Python
 * took one multipart POST carrying the file beside a JSON `fields` string, and
 * the cost of that shape is on screen in the Add-record dialog: a file could
 * only ever be attached *at* upload, never added to a record made earlier. A
 * row and its bytes are two facts; this posts the row and then attaches to it,
 * and the second call is the same route an "attach to this record" action
 * uses.
 *
 * **The bytes are the body, not a form field.** The server hashes and caps
 * while reading the stream, so there is no envelope to parse and nothing is
 * buffered first.
 *
 * **A failed attach leaves the record.** It is a real record of a real
 * artefact and the analyst typed it; discarding it to make the two calls look
 * like one would lose work to tidy up a failure the retry can fix.
 *
 * **No fake progress**, same reasoning as `useImportCase`: `fetch` has no
 * upload-progress event, so `isPending` is the whole of what the dialog can
 * honestly show.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, requestBody, type ApiError } from './client'
import type { EvidenceEntry } from './model'
import { toWire } from './naming'
import { keys } from './queryKeys'

export interface EvidenceUpload {
  file: File
  /** Never `hash` or `filePath` - both are computed server-side from the bytes. */
  fields: Partial<Omit<EvidenceEntry, 'id' | 'hash' | 'storedAt'>>
}

export function useEvidenceUpload(
  caseId: string,
): UseMutationResult<{ id: string }, ApiError, EvidenceUpload> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, 'evidence')

  return useMutation<{ id: string }, ApiError, EvidenceUpload>({
    mutationKey: [...listKey, 'upload'],
    mutationFn: async ({ file, fields }) => {
      const made = await request<{ id: string }>(
        `/cases/${encodeURIComponent(caseId)}/evidence`,
        { method: 'POST', body: toWire(fields) as Record<string, unknown> },
      )
      await requestBody(
        `/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(made.id)}/file`,
        file,
        // The name the file had on the analyst's disk, which the digest does
        // not carry and the row would otherwise never learn.
        { headers: { 'x-original-filename': file.name } },
      )
      return made
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: listKey })
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

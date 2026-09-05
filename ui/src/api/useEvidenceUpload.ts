/**
 * A record and its bytes: `POST .../evidence`, then `POST .../evidence/{id}/file`.
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

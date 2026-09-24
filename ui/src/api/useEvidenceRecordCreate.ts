/**
 * `POST /api/cases/{id}/evidence` with a JSON body - the metadata-only door,
 * beside the one `useEvidenceUpload` drives at `.../evidence/{id}/file` for
 * the bytes.
 *
 * `evidenceSchema` names neither `hash` nor `filePath` and the route parses it
 * `strict()`, so a record made here can never claim a file it does not have.
 * The batch door writes through the same schema and the same parse.
 * -> `server/src/domain/entities/evidence.ts`
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { EvidenceEntry } from './model'
import { keys } from './queryKeys'

export interface EvidenceRecordDraft {
  fields: Partial<Omit<EvidenceEntry, 'id' | 'hash' | 'storedAt'>>
}

export function useEvidenceRecordCreate(
  caseId: string,
): UseMutationResult<EvidenceEntry, ApiError, EvidenceRecordDraft> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, 'evidence')

  return useMutation<EvidenceEntry, ApiError, EvidenceRecordDraft>({
    mutationKey: [...listKey, 'create-record'],

    mutationFn: ({ fields }) =>
      request<EvidenceEntry>(`/cases/${encodeURIComponent(caseId)}/evidence`, {
        method: 'POST',
        body: fields,
      }),

    onSettled: () => {
      void client.invalidateQueries({ queryKey: listKey })
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

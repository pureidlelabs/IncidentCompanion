/**
 * `POST /api/cases/{id}/evidence` with a JSON body - the metadata-only door,
 * beside the one `useEvidenceUpload` drives at `.../evidence/{id}/file` for
 * the bytes.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { EvidenceEntry } from './model'
import { optimisticRow } from './optimisticRow'
import { keys } from './queryKeys'

export interface EvidenceRecordDraft {
  fields: Partial<Omit<EvidenceEntry, 'id' | 'hash' | 'storedAt'>>
}

interface CreateRollback {
  previous: EvidenceEntry[] | undefined
}

export function useEvidenceRecordCreate(
  caseId: string,
): UseMutationResult<EvidenceEntry, ApiError, EvidenceRecordDraft, CreateRollback> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, 'evidence')

  return useMutation<EvidenceEntry, ApiError, EvidenceRecordDraft, CreateRollback>({
    mutationKey: [...listKey, 'create-record'],

    mutationFn: ({ fields }) =>
      request<EvidenceEntry>(`/cases/${encodeURIComponent(caseId)}/evidence`, {
        method: 'POST',
        body: fields,
      }),

    onMutate: async ({ fields }) => {
      await client.cancelQueries({ queryKey: listKey })
      const previous = client.getQueryData<EvidenceEntry[]>(listKey)

      // A metadata-only draft: no hash, no file path, same as what the
      // server writes for a record that names no file. **Both are stated here
      // rather than left to the blank**, which carries the schema's own value
      // for a field the analyst *could* fill - these two are computed-only and
      // this door refuses them outright.
      const draft = optimisticRow<EvidenceEntry>(client, 'evidence', fields, {
        hash: '',
        filePath: null,
      })
      client.setQueryData<EvidenceEntry[]>(listKey, (rows) => [...(rows ?? []), draft])
      return { previous }
    },

    onError: (_error, _draft, context) => {
      if (context) client.setQueryData(listKey, context.previous)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: listKey })
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

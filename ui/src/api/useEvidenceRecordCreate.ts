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
import type { Case, EvidenceEntry } from './model'
import { optimisticRow } from './optimisticRow'
import { keys } from './queryKeys'

export interface EvidenceRecordDraft {
  fields: Partial<Omit<EvidenceEntry, 'id' | 'hash' | 'storedAt'>>
}

interface CreateRollback {
  previous: EvidenceEntry[] | undefined
  previousCase: Case | undefined
}

export function useEvidenceRecordCreate(
  caseId: string,
): UseMutationResult<EvidenceEntry, ApiError, EvidenceRecordDraft, CreateRollback> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, 'evidence')
  const caseKey = keys.case(caseId)

  return useMutation<EvidenceEntry, ApiError, EvidenceRecordDraft, CreateRollback>({
    mutationKey: [...listKey, 'create-record'],

    mutationFn: ({ fields }) =>
      request<EvidenceEntry>(`/cases/${encodeURIComponent(caseId)}/evidence`, {
        method: 'POST',
        body: fields,
      }),

    onMutate: async ({ fields }) => {
      // The screens render from the case document, so the write lands there as well as on the list.
      await Promise.all([
        client.cancelQueries({ queryKey: listKey }),
        client.cancelQueries({ queryKey: caseKey, exact: true }),
      ])
      const previous = client.getQueryData<EvidenceEntry[]>(listKey)
      const previousCase = client.getQueryData<Case>(caseKey)

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
      client.setQueryData<Case>(caseKey, (kase) => kase && { ...kase, evidence: [...kase.evidence, draft] })
      return { previous, previousCase }
    },

    onError: (_error, _draft, context) => {
      if (!context) return
      client.setQueryData(listKey, context.previous)
      client.setQueryData(caseKey, context.previousCase)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: listKey })
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

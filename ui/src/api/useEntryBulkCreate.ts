/**
 * `POST /api/cases/{id}/{collection}/bulk` - many rows, one undo frame,
 * all-or-nothing.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { BatchCreatableCollectionName } from './model'
import { keys } from './queryKeys'

export interface BulkCreateResult {
  ids: string[]
}

export function useEntryBulkCreate(
  caseId: string,
  collection: BatchCreatableCollectionName,
): UseMutationResult<BulkCreateResult, ApiError, Record<string, unknown>[]> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, collection)

  return useMutation<BulkCreateResult, ApiError, Record<string, unknown>[]>({
    mutationKey: [...listKey, 'bulk-create'],
    mutationFn: (rows) =>
      request<BulkCreateResult>(
        `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}/bulk`,
        { method: 'POST', body: { entries: rows } },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: listKey })
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

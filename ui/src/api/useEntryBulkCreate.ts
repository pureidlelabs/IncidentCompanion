/**
 * `POST /api/cases/{id}/{collection}/bulk` - many rows, one undo frame,
 * all-or-nothing.
 *
 * **No optimistic update**, unlike `useEntryCreate`. A CSV import's rows are
 * already on screen in the preview grid before this fires; appending them a
 * second time as placeholders would double-render what the analyst is
 * already looking at, for a request that is typically a handful of rows and
 * not one this app needs to hide the latency of. A plain invalidate on
 * success is what turns the preview into the real, server-assigned rows.
 *
 * **The error is not unwrapped here.** The server reports `"row N: ..."` for
 * a bad row and something row-less for a cap breach; mapping the former back
 * to a preview row is `csv-import.ts`'s `parseRowError` /
 * `previewIndexForServerRow`, kept out of the network layer so it stays a pure
 * function a test can hold without a fetch mock.
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

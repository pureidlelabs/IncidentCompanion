/**
 * Change many rows in one request, as one undo frame.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { CollectionEntry, CollectionName } from './model'
import { keys } from './queryKeys'

/**
 * A row named for patching, and the version the analyst read it at.
 */
export interface BulkPatchRow {
  id: string
  version: number
}

export interface BulkPatchVars<N extends CollectionName> {
  ids: BulkPatchRow[]
  fields: Partial<Omit<CollectionEntry[N], 'id'>>
}

export interface BulkPatchResult {
  updated: string[]
  missing: string[]
  /** Rows whose version had moved. They exist and were left as they were. */
  refused: string[]
}

export function useBulkPatch<N extends CollectionName>(
  caseId: string,
  collection: N,
): UseMutationResult<BulkPatchResult, ApiError, BulkPatchVars<N>> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, collection)

  return useMutation<BulkPatchResult, ApiError, BulkPatchVars<N>>({
    // Distinct from `[...listKey, 'patch']`: its variables carry `ids`, not
    // `entryId`, and `usePendingEntryIds` reads both shapes by this key.
    mutationKey: [...listKey, 'bulk-patch'],

    mutationFn: ({ ids, fields }) =>
      request<BulkPatchResult>(
        `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}/bulk`,
        { method: 'PATCH', body: { ids, fields } },
      ),

    onSettled: () => {
      void client.invalidateQueries({ queryKey: listKey })
      // As `useEntryMutation`: the case carries figures derived from its
      // entries, so a bulk edit changes the case without the case itself
      // being written.
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

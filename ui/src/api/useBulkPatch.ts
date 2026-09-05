/**
 * Change many rows in one request, as one undo frame.
 *
 * **Replaces `forEachRow`.** That helper existed only because the API had no
 * bulk route - its own docstring named the whole-case PUT it was avoiding and
 * called the N round trips "the price of the API having no bulk route".
 * `PATCH /{collection}/bulk` is that route: `{ids, fields}` in, `{updated,
 * missing, refused}` out, one PATCH regardless of selection size.
 *
 * **A bad field value is still all-or-nothing, but a stale row is not.** The
 * server refuses the whole patch before writing anything if the fields are
 * wrong; what it answers per row is whether that row took it. Two ways it may
 * not: `missing`, whose row another session deleted, and `refused`, whose
 * version had moved. Both are reported and neither is fatal.
 *
 * There is nothing here for a caller to roll back row-by-row: no optimistic
 * patch is applied, so none needs undoing.
 *
 * No `mutationFn` snapshot/rollback pair, unlike `useEntryMutation`: a
 * bulk PATCH either lands as one frame or does not land at all, so there is
 * no per-row optimistic state to keep in sync with a server that might
 * refuse only some of it.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { CollectionEntry, CollectionName } from './model'
import { keys } from './queryKeys'

/**
 * A row named for patching, and the version the analyst read it at.
 *
 * The selection is what the screen showed, which may be older than the case
 * by the time apply is pressed -- so the version travels per row rather than
 * per request, and a row somebody else moved is turned away on its own.
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

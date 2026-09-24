/**
 * Change many rows in one request.
 *
 * `PATCH /{collection}/bulk` takes `{ids, fields}` and answers `{updated,
 * missing, refused}`, one PATCH regardless of selection size.
 *
 * **A bad field value is still all-or-nothing, but a stale row is not.** The
 * server refuses the whole patch before writing anything if the fields are
 * wrong; what it answers per row is whether that row took it. Two ways it may
 * not: `missing`, whose row another session deleted, and `refused`, whose
 * version had moved. Both are reported and neither is fatal.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { CollectionEntry, CollectionName } from './model'
import { keys } from './queryKeys'
import { rowKey, writeRows, type Read } from './rowWrite'

/**
 * A row named for a selection's act, and the version the analyst read it at.
 *
 * The selection is what the screen showed when the act was pressed, which may
 * be older than the case by the time it is confirmed -- so the version travels
 * per row, and a row somebody else moved is turned away on its own.
 */
export interface BulkPatchRow {
  id: string
  version: Read
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
      writeRows(
        client,
        ids.map((row) => ({ key: rowKey(caseId, collection, row.id), read: row.version })),
        (versions) =>
          request<BulkPatchResult>(
            `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}/bulk`,
            {
              method: 'PATCH',
              body: { ids: ids.map((row, at) => ({ id: row.id, version: versions[at] })), fields },
            },
          ),
        // A row the patch took moved one version past the one it stated.
        (answer, stated) =>
          ids.map((row, at) => {
            const from = stated[at]
            return from !== undefined && answer.updated.includes(row.id) ? from + 1 : undefined
          }),
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

/** Remove one row: a DELETE stating the version the analyst read. */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { CollectionName } from './model'
import { keys } from './queryKeys'
import { rowKey, writeRow, type Read } from './rowWrite'

export interface EntryRemoval {
  entryId: string
  /**
   * The version of the row the analyst was looking at.
   *
   * **A delete is version-checked exactly like a patch**, and refused with the
   * same 400 without one. Removing a row somebody has just edited is the same
   * lost update as overwriting it - the difference is that nothing survives to
   * show what went. -> `collections/entities.controller.ts`
   */
  version: Read
}

/** The route answers with no body worth reading; the removal is the result. */
export type Removed = Record<string, never>

export function useEntryDelete(
  caseId: string,
  collection: CollectionName,
): UseMutationResult<Removed, ApiError, EntryRemoval> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, collection)

  return useMutation<Removed, ApiError, EntryRemoval>({
    mutationKey: [...listKey, 'delete'],

    // **A query parameter, not a body.** A DELETE with a body is refused or
    // silently dropped by enough of the stack that the route reads it off the
    // URL; `@Query('version')` is what the server declares.
    mutationFn: ({ entryId, version }) =>
      writeRow(client, rowKey(caseId, collection, entryId), version, (at) =>
        request<Removed>(
          `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}` +
            `?version=${encodeURIComponent(String(at))}`,
          { method: 'DELETE' },
        ),
      ),

    onSettled: () => {
      void client.invalidateQueries({ queryKey: listKey })
      // A deleted row can leave a dangling reference elsewhere in the case -
      // an evidence id on a timeline entry, a system id on an account - so the
      // whole case is refetched, not only this table.
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

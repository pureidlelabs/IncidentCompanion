/**
 * Remove one row: optimistic filter, DELETE, rollback on failure.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { CollectionEntry, CollectionName } from './model'
import { keys } from './queryKeys'

export interface EntryRemoval {
  entryId: string
  /**
   * The version of the row the analyst was looking at.
   */
  version: number
}

/** The route answers with no body worth reading; the removal is the result. */
export type Removed = Record<string, never>

interface DeleteRollback<N extends CollectionName> {
  previous: CollectionEntry[N][] | undefined
}

export function useEntryDelete<N extends CollectionName>(
  caseId: string,
  collection: N,
): UseMutationResult<Removed, ApiError, EntryRemoval, DeleteRollback<N>> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, collection)

  return useMutation<Removed, ApiError, EntryRemoval, DeleteRollback<N>>({
    mutationKey: [...listKey, 'delete'],

    // **A query parameter, not a body.** A DELETE with a body is refused or
    // silently dropped by enough of the stack that the route reads it off the
    // URL; `@Query('version')` is what the server declares.
    mutationFn: ({ entryId, version }) =>
      request<Removed>(
        `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}` +
          `?version=${encodeURIComponent(String(version))}`,
        { method: 'DELETE' },
      ),

    onMutate: async ({ entryId }) => {
      await client.cancelQueries({ queryKey: listKey })
      const previous = client.getQueryData<CollectionEntry[N][]>(listKey)

      client.setQueryData<CollectionEntry[N][]>(listKey, (rows) =>
        rows?.filter((row) => (row as { id: string }).id !== entryId),
      )
      return { previous }
    },

    onError: (_error, _removal, context) => {
      // The whole snapshot: a delete that fails alongside an edit to another
      // row must not restore the deleted row and drop the edit.
      if (context) client.setQueryData(listKey, context.previous)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: listKey })
      // A deleted row can leave a dangling reference elsewhere in the case -
      // an evidence id on a timeline entry, a system id on an account - so the
      // whole case is refetched, not only this table.
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

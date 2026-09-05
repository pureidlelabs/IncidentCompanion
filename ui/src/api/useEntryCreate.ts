/**
 * Add one row to a table: optimistic append, POST, rollback on failure.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type {
  CollectionEntry,
  GenericCreateCollectionName,
} from './model'
import { optimisticRow } from './optimisticRow'
import { keys } from './queryKeys'

/**
 * Whether this row is a placeholder the server has not acknowledged yet.
 */
export { isOptimisticId } from './optimisticRow'

export interface EntryDraft<N extends GenericCreateCollectionName> {
  fields: Partial<Omit<CollectionEntry[N], 'id'>>
}

interface CreateRollback<N extends GenericCreateCollectionName> {
  previous: CollectionEntry[N][] | undefined
}

/**
 * What `POST /api/cases/{id}/{collection}` answers with: **the row as stored**.
 */
export type CreatedEntry<N extends GenericCreateCollectionName> = CollectionEntry[N]

export function useEntryCreate<N extends GenericCreateCollectionName>(
  caseId: string,
  collection: N,
): UseMutationResult<CreatedEntry<N>, ApiError, EntryDraft<N>, CreateRollback<N>> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, collection)

  return useMutation<CreatedEntry<N>, ApiError, EntryDraft<N>, CreateRollback<N>>({
    mutationKey: [...listKey, 'create'],

    mutationFn: ({ fields }) =>
      request<CreatedEntry<N>>(
        `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}`,
        { method: 'POST', body: fields },
      ),

    onMutate: async ({ fields }) => {
      await client.cancelQueries({ queryKey: listKey })
      const previous = client.getQueryData<CollectionEntry[N][]>(listKey)

      // Appended, because that is where `case_api.add_entry` puts it. A row
      // that lands at the top optimistically and at the bottom on refetch
      // reads as the write having moved it.
      const draft = optimisticRow<CollectionEntry[N]>(client, collection, fields)
      client.setQueryData<CollectionEntry[N][]>(listKey, (rows) => [
        ...(rows ?? []),
        draft,
      ])
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

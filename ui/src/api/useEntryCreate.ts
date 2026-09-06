/**
 * Add one row to a table: optimistic append, POST, rollback on failure.
 *
 * Same skeleton as `useEntryMutation` - cancel, snapshot, apply, restore on
 * error, invalidate on settled - differing only in what it does to the list.
 * Written out rather than shared with the other two behind a generic: the
 * three differ in the one line that matters, and a helper parameterised by
 * "how to change the list" hides exactly the part worth reading.
 *
 * **The optimistic row carries a placeholder id.** The server assigns the real
 * one and returns it; `onSettled` refetches, so the placeholder lives for the
 * duration of one request and never reaches a link or a reference. Nothing may
 * key off it - `isOptimisticId` is exported so a component can refuse to open
 * a row that does not exist yet.
 *
 * **`evidence` is absent from `GenericCreateCollectionName` because the URL
 * goes elsewhere, not because anything refuses it.** `add_entry` accepts a
 * metadata-only evidence record; it simply never sees the request, since a
 * literal `/evidence` segment is registered above this route and takes the
 * address first. The two doors that URL opens are `useEvidenceUpload`
 * (multipart, a file) and `useEvidenceRecordCreate` (JSON, no file).
 *
 * Measured, because the previous note here said the opposite and was believed:
 * `POST /api/cases/X/evidence` with a JSON body answers **200** with a new id.
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
 *
 * **Re-exported rather than moved.** It lives beside the row builder now, and
 * several screens import it from here; a rename would be churn in files that
 * have no other reason to change.
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
 *
 * The route declares it -- `@ZodResponse({ status: 201, type: EntityRowDto,
 * description: 'The row as stored.' })` -- over a `.loose()` schema, so a
 * caller that wants what the server stored has it without re-reading.
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

      // Appended, because that is where the server puts a new row. One that
      // lands at the top optimistically and at the bottom on refetch reads as
      // the write having moved it.
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

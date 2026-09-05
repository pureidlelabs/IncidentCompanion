/**
 * The one mutation shape: optimistic apply, per-row PATCH, rollback on failure.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { CollectionEntry, CollectionName } from './model'
import { keys } from './queryKeys'

/**
 * What a successful PATCH answers with: **the row as stored**.
 */
export type WrittenEntry<N extends CollectionName> = CollectionEntry[N]

export interface EntryPatch<N extends CollectionName> {
  entryId: string
  /**
   * The version of the row the analyst was looking at.
   */
  version: number
  /** Only what changed. Sending a whole row defeats the point of the helper. */
  fields: Partial<Omit<CollectionEntry[N], 'id'>>
  /**
   * What the form was rendered from, for the merge review a refusal raises.
   */
  base?: Partial<Omit<CollectionEntry[N], 'id'>> | undefined
}

interface Rollback<N extends CollectionName> {
  previous: CollectionEntry[N][] | undefined
}

export function useEntryMutation<N extends CollectionName>(
  caseId: string,
  collection: N,
): UseMutationResult<WrittenEntry<N>, ApiError, EntryPatch<N>, Rollback<N>> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, collection)

  return useMutation<WrittenEntry<N>, ApiError, EntryPatch<N>, Rollback<N>>({
    // Named so `usePendingEntryIds` can find every in-flight write to this
    // table. Without it a section has only `isPending`, which is one boolean
    // for however many rows are in flight - two concurrent edits then share
    // one spinner and it sits on whichever row went last.
    mutationKey: [...listKey, 'patch'],

    // `version` and `base` ride *beside* the fields rather than inside them:
    // the server destructures both out before validating, and `.strict()`
    // refuses anything else it does not recognise as a column.
    mutationFn: ({ entryId, version, fields, base }) =>
      request<WrittenEntry<N>>(
        `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}`,
        { method: 'PATCH', body: { version, ...(base ? { base } : {}), ...fields } },
      ),

    onMutate: async ({ entryId, fields }) => {
      // Without this an in-flight refetch that started before the edit lands
      // after it and overwrites the optimistic row with the stale server copy.
      await client.cancelQueries({ queryKey: listKey })
      const previous = client.getQueryData<CollectionEntry[N][]>(listKey)

      client.setQueryData<CollectionEntry[N][]>(listKey, (rows) =>
        rows?.map((row) =>
          (row as { id: string }).id === entryId ? { ...row, ...fields } : row,
        ),
      )
      return { previous }
    },

    onError: (_error, _patch, context) => {
      // The whole list, not the one row: `previous` is the snapshot taken
      // above, and restoring a single row would keep any *other* optimistic
      // edit that the same failure also invalidated.
      if (context) client.setQueryData(listKey, context.previous)
    },

    onSettled: () => {
      // On success too, and the second line is why: the case carries figures
      // derived from its entries - an unstated `Case.severity` falls back to
      // the worst entry's - so a row edit changes the case without the case
      // being written.
      void client.invalidateQueries({ queryKey: listKey })
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

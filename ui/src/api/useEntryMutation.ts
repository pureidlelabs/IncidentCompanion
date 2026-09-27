/**
 * Change one row: a PATCH of the fields that changed.
 *
 * Sends **only the fields that changed, for one row**, so two writers collide
 * only on the same field of the same entry. There is no route that takes a
 * whole case.
 *
 * **`base` rides beside the patch** and is what the form was rendered from.
 * The server keeps no copy of that, so without it a refusal cannot tell "we
 * both edited this field" from "the row moved underneath me".
 *
 * **No undo affordance**; point-in-time restore replaces it.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { CollectionEntry, CollectionName } from './model'
import { keys } from './queryKeys'
import { rowKey, writeRow, type Read } from './rowWrite'

/**
 * What a successful PATCH answers with: **the row as stored**.
 *
 * The route declares it -- `@ZodResponse({ type: EntityRowDto, description:
 * 'The row as stored after the patch.' })` -- and returns `asRow(result.row)`
 * over a `.loose()` schema, so nothing is stripped on the way out.
 */
export type WrittenEntry<N extends CollectionName> = CollectionEntry[N]

export interface EntryPatch<N extends CollectionName> {
  entryId: string
  /** The version of the row the analyst was looking at. */
  version: Read
  /** Only what changed. Sending a whole row defeats the point of the helper. */
  fields: Partial<Omit<CollectionEntry[N], 'id'>>
  /**
   * What the form was rendered from, for the merge review a refusal raises.
   *
   * Optional because a cell-level write has no form behind it and nothing
   * useful to say about a base; the review then names every patched field,
   * which is the honest degradation.
   */
  base?: Partial<Omit<CollectionEntry[N], 'id'>> | undefined
}

export function useEntryMutation<N extends CollectionName>(
  caseId: string,
  collection: N,
): UseMutationResult<WrittenEntry<N>, ApiError, EntryPatch<N>> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, collection)

  return useMutation<WrittenEntry<N>, ApiError, EntryPatch<N>>({
    // Named so `usePendingEntryIds` can find every in-flight write to this
    // table. Without it a section has only `isPending`, which is one boolean
    // for however many rows are in flight.
    mutationKey: [...listKey, 'patch'],

    // `version` and `base` ride *beside* the fields rather than inside them:
    // the server destructures both out before validating, and `.strict()`
    // refuses anything else it does not recognise as a column.
    mutationFn: ({ entryId, version, fields, base }) =>
      writeRow(
        client,
        rowKey(caseId, collection, entryId),
        version,
        (at) =>
          request<WrittenEntry<N>>(
            `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}`,
            { method: 'PATCH', body: { version: at, ...(base ? { base } : {}), ...fields } },
          ),
        (stored) => (stored as { version: number }).version,
      ),

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

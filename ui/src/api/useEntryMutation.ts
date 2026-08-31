/**
 * The one mutation shape: optimistic apply, per-row PATCH, rollback on failure.
 *
 * Sends **only the fields that changed, for one row**, so two writers collide
 * only on the same field of the same entry. There is no route that takes a
 * whole case.
 *
 * **A patch that does not name the version it read is refused with a 400
 * before the server looks at a field**, so `version` is required on the type:
 * omitting it is a compile error rather than something an analyst meets. It is
 * the version of the row the analyst was looking at and **the caller supplies
 * it** - this hook must not read one out of the cache, which would adopt
 * another analyst's row as the base.
 *
 * **`base` rides beside the patch** and is what the form was rendered from.
 * The server keeps no copy of that, so without it a refusal cannot tell "we
 * both edited this field" from "the row moved underneath me".
 *
 * **No undo affordance**; point-in-time restore replaces it.
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
 *
 * The route declares it -- `@ZodResponse({ type: EntityRowDto, description:
 * 'The row as stored after the patch.' })` -- and returns `asRow(result.row)`
 * over a `.loose()` schema, so nothing is stripped on the way out.
 *
 * **This said `{ id }` and "nothing else" until 2026-08-28**, which threw the
 * row away at the type level while it arrived at runtime. A caller that wants
 * what the server stored -- which is every collection screen, so a refused
 * version check cannot leave a merged copy on screen -- had to re-fetch for
 * something it already had.
 */
export type WrittenEntry<N extends CollectionName> = CollectionEntry[N]

export interface EntryPatch<N extends CollectionName> {
  entryId: string
  /**
   * The version of the row the analyst was looking at.
   *
   * **Required, and never read from the cache here.** See the module
   * docstring: a cached version is another analyst's row adopted as your base.
   */
  version: number
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

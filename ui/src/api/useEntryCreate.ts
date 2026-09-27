/**
 * Add one row to a table: a POST, and the table read again once it is answered.
 *
 * Nothing is drawn before the answer. The screens append the row the server
 * stored, which carries the id it assigned.
 *
 * **`evidence` never reaches this hook because the URL goes elsewhere, not
 * because anything refuses it.** `GenericCreateCollectionName` is an alias of
 * `CollectionName` and excludes nothing, so the routing below is the whole of
 * it. `add_entry` accepts a
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
import type { CollectionEntry, GenericCreateCollectionName } from './model'
import { keys } from './queryKeys'

export interface EntryDraft<N extends GenericCreateCollectionName> {
  fields: Partial<Omit<CollectionEntry[N], 'id'>>
}

/**
 * The POST alone, for a caller the mutation is too slow for.
 *
 * `mutateAsync` resolves its own bookkeeping before it reaches this, and a
 * caller inside a `pagehide` handler has no later tick to be resumed on -- the
 * renderer is gone and the request was never issued. Calling this issues the
 * `fetch` synchronously, and `keepalive` is what lets it outlive the document.
 *
 * **No invalidation**, which is the whole difference: it describes a screen
 * that is about to stop existing.
 */
export function createEntry<N extends GenericCreateCollectionName>(
  caseId: string,
  collection: N,
  fields: EntryDraft<N>['fields'],
  keepalive = false,
): Promise<CreatedEntry<N>> {
  return request<CreatedEntry<N>>(
    `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}`,
    { method: 'POST', body: fields, ...(keepalive ? { keepalive } : {}) },
  )
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
): UseMutationResult<CreatedEntry<N>, ApiError, EntryDraft<N>> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, collection)

  return useMutation<CreatedEntry<N>, ApiError, EntryDraft<N>>({
    mutationKey: [...listKey, 'create'],

    mutationFn: ({ fields }) => createEntry(caseId, collection, fields),

    onSettled: () => {
      void client.invalidateQueries({ queryKey: listKey })
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

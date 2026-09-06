import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { CollectionName } from './model'
import { keys } from './queryKeys'

/**
 * Remove a selection spanning tables, in one request.
 *
 * **`POST /bulk-delete`, not N `DELETE`s**, because order would decide the
 * outcome. Malware names a system, so a loop that deleted the asset first
 * would be refused and one that deleted the malware first would not. The route
 * counts references against what survives the call, which no client-side loop
 * can express.
 *
 * **No optimistic patch.** The server refuses the whole selection when a row
 * that is staying still names one of them, so there is no partial outcome to
 * reconcile: nothing is removed until the call returns, and the 409 leaves the
 * table exactly as it was.
 */
export interface BulkDeleteVars {
  /** Collection name to entry ids. Empty lists are allowed and write nothing. */
  targets: Partial<Record<CollectionName, string[]>>
}

export interface BulkDeleted {
  deleted: { collection: string; id: string }[]
  missing: { collection: string; id: string }[]
}

/** The 409's body: id to the number of rows still naming it. A map rather than
 *  a total, because a selection spanning tables cannot be corrected from one
 *  number - which of forty rows is the analyst meant to deselect? */
export function referencesHolding(error: ApiError): Record<string, number> {
  const body = error.body
  if (!body || typeof body !== 'object') return {}
  const held = (body as { references?: unknown }).references
  return held && typeof held === 'object' ? (held as Record<string, number>) : {}
}

export function useBulkDelete(
  caseId: string,
): UseMutationResult<BulkDeleted, ApiError, BulkDeleteVars> {
  const client = useQueryClient()
  return useMutation<BulkDeleted, ApiError, BulkDeleteVars>({
    mutationKey: [...keys.case(caseId), 'bulk-delete'],
    mutationFn: ({ targets }) =>
      request<BulkDeleted>(`/cases/${encodeURIComponent(caseId)}/bulk-delete`, {
        method: 'POST',
        /**
         * **Pairs on the wire, a map at the call site.**
         *
         * The server camelCases every key of every request body before its
         * schema sees it, and cannot tell a field name from data -- so
         * `network_indicators` arrived as `networkIndicators`, was refused by
         * the enum, and deleting a selection on the Network or Cloud apps
         * screen answered "Invalid key in record" while the eight
         * single-word collections worked. The collection travels as a value.
         */
        body: {
          targets: Object.entries(targets).map(([collection, ids]) => ({
            collection,
            ids,
          })),
        },
      }),
    onSuccess: (result) => {
      // Every collection the call touched, plus the case itself: the counts on
      // the scope chips and the rail come off `useCase`, so invalidating only
      // the collections would leave both showing the pre-delete numbers.
      for (const collection of new Set(result.deleted.map((row) => row.collection))) {
        void client.invalidateQueries({
          queryKey: keys.collection(caseId, collection as CollectionName),
        })
      }
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

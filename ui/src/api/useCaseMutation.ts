/**
 * Change the case's own details.
 *
 * The fifth verb, and the only one that writes something other than a row.
 * `PATCH /api/cases/{id}` takes the case's own fields only - a table sent here
 * is refused, which is why `CaseFields` omits every collection key rather than
 * trusting the caller to.
 *
 * `caseId` and `schemaVersion` are omitted too: the API rejects both, one as
 * identity and the other as the loader's contract.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { Case, CollectionName, COLLECTION_TO_CASE_KEY } from './model'
import { keys } from './queryKeys'
import { rowKey, writeRow, type Read } from './rowWrite'

type CaseTableKey = (typeof COLLECTION_TO_CASE_KEY)[CollectionName]

/** The fields `PATCH /api/cases/{id}` will accept. */
export type CaseFields = Partial<Omit<Case, CaseTableKey | 'caseId' | 'schemaVersion' | 'version'>>

/** One write: the fields, and the version of the case they were read at. */
export interface CaseWrite {
  version: Read
  fields: CaseFields
}

/** What the route answers with: the case as stored. */
export type WrittenCase = CaseFields & { id: string; version: number }

export function useCaseMutation(
  caseId: string,
): UseMutationResult<WrittenCase, ApiError, CaseWrite> {
  const client = useQueryClient()

  return useMutation<WrittenCase, ApiError, CaseWrite>({
    mutationKey: [...keys.case(caseId), 'patch'],

    // `version` rides *beside* the fields rather than inside them, so a caller
    // cannot express a write that changes the version it is checking against.
    mutationFn: ({ version, fields }) =>
      writeRow(
        client,
        rowKey(caseId, 'cases', caseId),
        version,
        (at) =>
          request<WrittenCase>(`/cases/${encodeURIComponent(caseId)}`, {
            method: 'PATCH',
            body: { version: at, ...fields },
          }),
        (stored) => stored.version,
      ),

    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
      // The picker's summary row is derived from these fields, so a changed
      // description or status is stale in the case list until this fires.
      void client.invalidateQueries({ queryKey: keys.cases() })
    },
  })
}

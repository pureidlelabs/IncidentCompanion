/**
 * Change the case's own details: optimistic merge, PATCH, rollback on failure.
 *
 * The fifth verb, and the only one that writes something other than a row.
 * `PATCH /api/cases/{id}` takes the case's own fields only - a table sent here
 * is refused by `_checked_case_fields`, which is why `CaseFields` omits every
 * collection key rather than trusting the caller to.
 *
 * `caseId` and `schemaVersion` are omitted too: the API rejects both, one as
 * identity and the other as the loader's contract.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { Case, CollectionName, COLLECTION_TO_CASE_KEY } from './model'
import { keys } from './queryKeys'

type CaseTableKey = (typeof COLLECTION_TO_CASE_KEY)[CollectionName]

/** The fields `PATCH /api/cases/{id}` will accept. */
export type CaseFields = Partial<Omit<Case, CaseTableKey | 'caseId' | 'schemaVersion' | 'version'>>

/**
 * One write: the fields, and the version they were read at.
 *
 * **The version is the write, not a refinement of it.** A patch that does not
 * name the version it read is refused outright - *"A patch has to name the
 * version it read."* - and this helper did not send one, so **every field on
 * Case settings was unsaveable**. Measured in a browser 2026-08-12: editing
 * *Customer* sent `{"customer":"..."}` and took a 422.
 *
 * **The caller supplies it, and that is the same rule `useEntryMutation`
 * states.** A read may refresh; a write may not. Taking whatever version sits
 * in the cache when the request leaves adopts another analyst's row as your
 * base, and the check then passes on a save that should have been a question.
 */
export interface CaseWrite {
  /** The version of the case the analyst was looking at. */
  version: number
  fields: CaseFields
}

interface CaseRollback {
  previous: Case | undefined
}

/** What the route answers with. */
export interface WrittenCase {
  caseId: string
}

export function useCaseMutation(
  caseId: string,
): UseMutationResult<WrittenCase, ApiError, CaseWrite, CaseRollback> {
  const client = useQueryClient()
  const caseKey = keys.case(caseId)

  return useMutation<WrittenCase, ApiError, CaseWrite, CaseRollback>({
    mutationKey: [...caseKey, 'patch'],

    // `version` rides *beside* the fields rather than inside them, so a caller
    // cannot express a write that changes the version it is checking against.
    mutationFn: ({ version, fields }) =>
      request<WrittenCase>(`/cases/${encodeURIComponent(caseId)}`, {
        method: 'PATCH',
        body: { version, ...fields },
      }),

    onMutate: async ({ fields }) => {
      await client.cancelQueries({ queryKey: caseKey })
      const previous = client.getQueryData<Case>(caseKey)
      client.setQueryData<Case>(caseKey, (current) =>
        current ? { ...current, ...fields } : current,
      )
      return { previous }
    },

    onError: (_error, _fields, context) => {
      if (context) client.setQueryData(caseKey, context.previous)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: caseKey })
      // The picker's summary row is derived from these fields, so a changed
      // description or status is stale in the case list until this fires.
      void client.invalidateQueries({ queryKey: keys.cases() })
    },
  })
}

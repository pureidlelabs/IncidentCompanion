/**
 * `POST /api/cases` - the picker's New case door.
 *
 * ## What a case is minted from, and why `caseId` is gone
 *
 * This sent `caseId`, `description` and `incidentReference`, and the server
 * asks for `title`, `summary` and `reference` - with `title` **required** and
 * never on the form. Every create answered 400, so the picker could not do its
 * primary job. Measured 2026-08-10 by driving the form.
 *
 * **`caseId` was Python's folder name on disk**, which is why it was the one
 * required field and why `sanitize_case_id` existed to rewrite what the
 * analyst typed. There is no folder: a case is a row with a uuid the server
 * mints, so the field was asking the analyst to name a directory that no
 * longer exists. What identifies a case to a *person* is its title and the
 * incident reference it was raised under, and both are here.
 *
 * **`title` is the required one now**, because a case with no name is
 * unfindable in a list of cases - which is the failure the id was standing in
 * for.
 *
 * Not built on `useEntryCreate`'s skeleton: a case is not a row in a
 * collection this app already holds - there is nothing to append to and
 * nowhere to roll an optimistic insert back to. The picker's list is
 * invalidated on success instead of patched, and the caller navigates into
 * the case rather than watching it appear in a list.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import { keys } from './queryKeys'

export interface NewCaseFields {
  /** What the case is called. The only field a create must carry. */
  title: string
  /** The ticket or incident this was raised under - free text, not an id. */
  reference?: string
  customer?: string
  summary?: string
  /**
   * A case template's `name`. The server resolves it and seeds the checklist
   * in the same transaction as the insert, so a case never exists half-seeded.
   */
  template?: string
}

/**
 * What `POST /api/cases` answers with.
 *
 * The whole row, of which the caller needs `id` - the uuid the server minted,
 * which is what every later URL is built from.
 */
export interface CreatedCase {
  id: string
}

export function useCreateCase(): UseMutationResult<CreatedCase, ApiError, NewCaseFields> {
  const client = useQueryClient()

  return useMutation<CreatedCase, ApiError, NewCaseFields>({
    mutationFn: (fields) =>
      request<CreatedCase>('/cases', {
        method: 'POST',
        body: { ...fields } as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.cases() })
    },
  })
}

/**
 * `POST /api/cases` - the picker's New case door.
 *
 * The server asks for `title`, `summary` and `reference`, with `title`
 * required. **`title` is the required one**, because a case with no name is
 * unfindable in a list of cases; a uuid the server mints is what identifies it
 * to the app, and the title and the incident reference are what identify it to
 * a person.
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

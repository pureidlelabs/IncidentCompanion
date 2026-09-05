/**
 * `POST /api/cases` - the picker's New case door.
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

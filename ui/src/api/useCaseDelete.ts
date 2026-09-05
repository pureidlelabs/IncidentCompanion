/**
 * `DELETE /api/cases/{id}` - the picker's own delete, not `useEntryDelete`'s:
 * a case is not a row in a collection the picker already holds, and its
 * removal is not an undo frame (`case_api.delete_case`'s docstring - "the one
 * delete nothing walks back").
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import { keys } from './queryKeys'

export function useCaseDelete(): UseMutationResult<Record<string, never>, ApiError, string> {
  const client = useQueryClient()

  return useMutation<Record<string, never>, ApiError, string>({
    mutationFn: (caseId) =>
      request<Record<string, never>>(`/cases/${encodeURIComponent(caseId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.cases() })
    },
  })
}

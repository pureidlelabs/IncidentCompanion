/**
 * What a refused save disagreed about, and the two answers to it.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult }
  from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

/** One field, three ways. */
export interface FieldConflict {
  field: string
  /** What this analyst's edit was made against. */
  base: string
  mine: string
  theirs: string
}

/**
 * **camelCase, because `client.request` rewrites every key at every depth.**
 */
export interface RowReview {
  table: string
  entryId: string
  /** A hostname, a description - never the id. */
  label: string
  fields: FieldConflict[]
  /** They deleted the row this analyst was editing. */
  deletedByThem: boolean
}

export function usePendingConflicts(caseId: string): UseQueryResult<RowReview[]> {
  return useQuery({
    queryKey: keys.conflicts(caseId),
    queryFn: async () => {
      const answer = await request<{ rows: RowReview[] }>(
        `/cases/${encodeURIComponent(caseId)}/conflicts`)
      return answer.rows
    },
    enabled: Boolean(caseId),
  })
}

/**
 * Answer the review.
 */
export function useResolveConflicts(caseId: string) {
  const queries = useQueryClient()
  return useMutation({
    mutationFn: (choice: 'mine' | 'theirs') =>
      request<{ settled: number }>(
        `/cases/${encodeURIComponent(caseId)}/conflicts/resolve`,
        { method: 'POST', body: { choice } }),
    onSuccess: () => {
      // The whole case: either answer moved rows, and which ones is the
      // server's business rather than something to mirror here.
      void queries.invalidateQueries({ queryKey: keys.case(caseId) })
      void queries.invalidateQueries({ queryKey: keys.conflicts(caseId) })
    },
  })
}

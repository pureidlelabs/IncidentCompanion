/**
 * How long the install's audit is kept.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'

export interface RetentionView {
  days: number
  /** The floor the server refuses to go below, so a screen need not repeat it. */
  floorDays: number
  /**
   * The second window, for lines that are volume rather than evidence.
   */
  operationalDays: number
  operationalFloorDays: number
}

const KEY = ['install-audit-retention'] as const

export function useAuditRetention(): UseQueryResult<RetentionView> {
  return useQuery({ queryKey: KEY, queryFn: () => request<RetentionView>('/install/audit/retention') })
}

export function useSetAuditRetention() {
  const cache = useQueryClient()
  return useMutation({
    // Either window, or both. The server records each change on the audit.
    mutationFn: (body: { days?: number; operationalDays?: number }) =>
      request<RetentionView>('/install/audit/retention', { method: 'PUT', body }),
    onSuccess: (view) => {
      cache.setQueryData(KEY, view)
      /**
       * **The activity list is stale the moment this succeeds**, because the change
       * wrote a line into it.
       */
      void cache.invalidateQueries({ queryKey: ['install-activity'] })
    },
  })
}

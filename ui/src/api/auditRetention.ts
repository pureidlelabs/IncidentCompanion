/**
 * How long the install's audit is kept.
 *
 * **The one setting whose change is itself audited**, and at `Critical` when
 * the window shortens - so this is not the same shape as a preference toggle,
 * and the screen that draws it should not pretend it is.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'

export interface RetentionView {
  days: number
  /** The floor the server refuses to go below, so a screen need not repeat it. */
  floorDays: number
  /**
   * The second window, for lines that are volume rather than evidence.
   *
   * **Which lines those are is decided per event, not per channel.** The
   * channel would shorten `case_deleted` and `audit_retention_changed`,
   * which are the two an administrator most needs a year later.
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
       * **The activity list is stale the moment this succeeds**, because the
       * change wrote a line into it. Invalidating is what stops an
       * administrator changing the window and seeing a log that does not
       * mention it.
       */
      void cache.invalidateQueries({ queryKey: ['install-activity'] })
    },
  })
}

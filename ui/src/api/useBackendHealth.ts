/**
 * `GET /api/health`, polled, so a broken backend announces itself.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { ApiError, request } from './client'
import { keys } from './queryKeys'
import type { HealthReport } from './backendHealth'

/** How often to ask while everything is well. */
const WHEN_WELL_MS = 30_000

/**
 * How often to ask once something is down.
 */
const WHEN_BROKEN_MS = 5_000

export function useBackendHealth(): UseQueryResult<HealthReport> {
  return useQuery({
    queryKey: keys.health(),
    queryFn: async (): Promise<HealthReport> => {
      try {
        return await request<HealthReport>('/health')
      } catch (error) {
        // A 503 *is* the report. Anything else - the server unreachable
        // entirely, a proxy answering HTML - has no report to show, and is
        // rethrown so the query's own error state holds it.
        if (error instanceof ApiError && error.status === 503) {
          return error.body as HealthReport
        }
        throw error
      }
    },
    refetchInterval: (query) => (query.state.data?.status === 'ok' ? WHEN_WELL_MS : WHEN_BROKEN_MS),
    // **Polled while the tab is in the background too.** An analyst who comes
    // back to a tab that has been open all night should see the banner, not a
    // stale "all is well" for as long as the next poll takes.
    refetchIntervalInBackground: true,
    // One retry: the poll itself is the retry, and a failed probe that retries
    // three times with backoff reports an outage later than the next poll would.
    retry: 1,
    staleTime: 0,
  })
}

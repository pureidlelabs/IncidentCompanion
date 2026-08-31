/**
 * What has happened on this case, newest first.
 *
 * **The other read over the change feed**, beside `useAttribution`. That one
 * asks who last wrote each row and keys a `Map` on `table:id`; this asks what
 * has been happening and keeps the order. Same table, two questions.
 *
 * The key sits under `keys.case(caseId)`, so the change feed's whole-case
 * invalidation reaches it - which is exactly right here, because any write on
 * the case is a new entry in this list.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

/** One write, as the feed recorded it. */
export interface ActivityEntry {
  /** The feed's own order. Monotonic, so "since you last looked" is answerable. */
  seq: number
  /** The collection written to, in the wire's own spelling. */
  entity: string
  entityId: string
  op: string
  version: number
  /** The analyst, by display name. Empty for an import or a bearer. */
  by: string
  /** Seconds since the epoch. */
  at: number
  /** Which fields the write touched, recorded when it was made. */
  fields: string[]
}

export function useActivity(caseId: string): UseQueryResult<ActivityEntry[]> {
  return useQuery({
    queryKey: keys.activity(caseId),
    queryFn: async () => {
      const answer = await request<{ rows: ActivityEntry[] }>(
        `/cases/${encodeURIComponent(caseId)}/activity`)
      return answer.rows
    },
    enabled: Boolean(caseId),
  })
}

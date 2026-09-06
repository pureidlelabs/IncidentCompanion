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

export interface ActivityEntry {
  /** The feed's own order. Monotonic, so "since you last looked" is answerable. */
  seq: number
  /**
   * The table written to, in the wire's own spelling. Not `CollectionName`:
   * the feed also carries `cases`, which no collection answers to.
   */
  entity: string
  entityId: string
  op: string
  version: number
  /**
   * The analyst, by display name, falling back to the address they signed in
   * with and then to their id. Empty only once the account itself is gone -
   * every write is attributed, so an empty name is a deleted analyst.
   */
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

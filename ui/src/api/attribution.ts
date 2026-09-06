/**
 * Who last changed each row, and when.
 *
 * **Its own query, not part of the collection.** `GET /api/cases/{id}/{table}`
 * returns exactly what `GET /api/cases/{id}` holds under that key, and the two
 * answering differently about the same rows is what that contract exists to
 * prevent - so a fact *about* a row is served beside it rather than folded in.
 *
 * The key sits under `keys.case(caseId)`, so the change feed's whole-case
 * invalidation reaches it for free; `useCaseChanges` invalidates it on a
 * scoped change too, because any row write moves it.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

/** One row's last write. `by` is empty only once the analyst's account is gone. */
export interface RowStamp {
  by: string
  /** Seconds since the epoch, narrowed from the change feed's timestamp. */
  at: number
  version: number
}

export interface RowStampRecord extends RowStamp {
  table: string
  entryId: string
}

/** `"table:id" -> stamp`. A row nobody has ever written is absent. */
export type Attribution = Map<string, RowStamp>

/**
 * **Served as a list and keyed here.** `client.request` rewrites every key at
 * every depth on the way in, so a table name used as an *object key* would
 * arrive camelised - `network_indicators` as `networkIndicators`, matching
 * nothing and failing nowhere. Keys carry field names; data lives in values.
 */
export function useAttribution(caseId: string): UseQueryResult<Attribution> {
  return useQuery({
    queryKey: keys.attribution(caseId),
    queryFn: async () => {
      const answer = await request<{ rows: RowStampRecord[] }>(
        `/cases/${encodeURIComponent(caseId)}/attribution`)
      return new Map(answer.rows.map((row) => [`${row.table}:${row.entryId}`, row]))
    },
    enabled: Boolean(caseId),
  })
}

export function stampFor(
  attribution: Attribution | undefined, table: string, entryId: string,
): RowStamp | undefined {
  return attribution?.get(`${table}:${entryId}`)
}

/**
 * "2 minutes ago", and **"just now" under a minute rather than "0 minutes"**.
 *
 * Coarse on purpose past an hour: the question this answers is *is my copy
 * stale*, and the difference between 3 and 4 hours does not change the
 * answer. Exact times live in the change record, which is what a reader
 * wanting one is after.
 */
export function agoLabel(at: number, now = Date.now() / 1000): string {
  const seconds = Math.max(0, now - at)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)}h ago`
  return `${String(Math.floor(hours / 24))}d ago`
}

export function editedLabel(stamp: RowStamp, now?: number): string {
  const when = agoLabel(stamp.at, now)
  return stamp.by ? `${when} by ${stamp.by}` : when
}

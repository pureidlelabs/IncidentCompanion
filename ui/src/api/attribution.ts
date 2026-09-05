/**
 * Who last changed each row, and when.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

/** One row's last write. `by` is empty for an import or a bearer. */
export interface RowStamp {
  by: string
  /** Seconds since the epoch, as the row column stores it. */
  at: number
  version: number
}

/** One served record: which row, and its stamp. */
export interface RowStampRecord extends RowStamp {
  table: string
  entryId: string
}

/** `"table:id" -> stamp`. A row nobody has ever written is absent. */
export type Attribution = Map<string, RowStamp>

/**
 * **Served as a list and keyed here.**
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

/** The stamp for one row, or undefined. */
export function stampFor(
  attribution: Attribution | undefined, table: string, entryId: string,
): RowStamp | undefined {
  return attribution?.get(`${table}:${entryId}`)
}

/**
 * "2 minutes ago", and **"just now" under a minute rather than "0 minutes"**.
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

/**
 * What the expanded row prints: when, and by whom if anyone is named.
 */
export function editedLabel(stamp: RowStamp, now?: number): string {
  const when = agoLabel(stamp.at, now)
  return stamp.by ? `${when} by ${stamp.by}` : when
}

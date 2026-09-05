/**
 * The install's audit log, newest first, one page at a time.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { request } from './client'

/** Which log a line belongs to. The server's `install_channel`. */
export type AuditChannel = 'authentication' | 'administration' | 'case' | 'operations'

/**
 * ECS `event.outcome`: whether the event represents a success or a failure
 * from the perspective of what produced it.
 */
export type Outcome = 'success' | 'failure' | 'unknown'

/**
 * OCSF `severity`, the framework's own six-point scale. Derived by the server.
 * -> <https://schema.ocsf.io/1.7.0/classes/base_event>
 */
export type Severity = 'Informational' | 'Low' | 'Medium' | 'High' | 'Critical' | 'Fatal'

export interface AuditLine {
  /** Ascending, and the cursor to resume from. A string: it outgrows `number`. */
  seq: string
  id: string
  event: string
  channel: AuditChannel
  outcome: Outcome
  severity: Severity
  /** OCSF `severity_id`, 1-6. */
  severityId: number
  /** OCSF `status_id`: 1 Success, 2 Failure. */
  statusId: number
  /** OCSF classification, so a collector needs no mapping. */
  categoryUid: number
  classUid: number
  className: string
  activityId: number
  activityName: string
  /** `class_uid * 100 + activity_id`. */
  typeUid: number
  /** ISO 8601 UTC. */
  at: string
  actorLabel: string | null
  targetLabel: string | null
  /** OpenTelemetry `Attributes`: what varies per occurrence. */
  attributes: Record<string, string>
  ipAddress: string | null
  userAgent: string | null
  /** How many of this event, from this origin, sit in the same short window. */
  runLength: number
}

export interface AuditPage {
  events: AuditLine[]
  nextCursor: string | null
  /** Every channel with a count, so the filter row can say how many it holds. */
  counts: Record<string, number>
  /** The same, per ECS outcome, so both chip groups count one population. */
  outcomes: Record<string, number>
  /**
   * The same, per OCSF severity name.
   */
  severities: Record<string, number>
}

/**
 * The severity floor, as the OCSF `severity_id` the server filters on.
 */
export const SEVERITY_ID: Record<Severity, number> = {
  Informational: 1,
  Low: 2,
  Medium: 3,
  High: 4,
  Critical: 5,
  Fatal: 6,
}

/** Offered as a floor, coarsest first. `Fatal` is a filter for an empty page. */
export const SEVERITY_FLOORS: readonly Severity[] = ['Low', 'Medium', 'High', 'Critical']

/**
 * How far back the list reaches.
 */
export const RANGES = [
  { key: '24h', label: '24 hours', hours: 24 },
  { key: '7d', label: '7 days', hours: 24 * 7 },
  { key: '30d', label: '30 days', hours: 24 * 30 },
  { key: 'all', label: 'All', hours: null },
] as const

export type RangeKey = (typeof RANGES)[number]['key']

export const PAGE_SIZE = 50

export interface Paged {
  page: AuditPage | undefined
  isPending: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  /** 1-based, so the pager can say where the reader is. */
  pageNumber: number
  hasPrevious: boolean
  hasNext: boolean
  next: () => void
  previous: () => void
  /** Back to the newest page, which is what a filter change does. */
  reset: () => void
}

/**
 * **Cursor paging with a remembered trail, because a cursor only goes
 * forward.**
 */
export function useInstallActivity(
  channel: AuditChannel | 'all',
  range: RangeKey,
  minSeverity?: Severity,
): Paged {
  /** The cursor each visited page started at. `''` is the newest page. */
  const [trail, setTrail] = useState<string[]>([''])

  const cursor = trail.at(-1) ?? ''

  const query = useQuery({
    queryKey: ['install-activity', channel, range, minSeverity ?? '', cursor],
    queryFn: () => {
      const at = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (channel !== 'all') at.set('channel', channel)
      if (cursor) at.set('after', cursor)
      if (minSeverity) at.set('minSeverity', String(SEVERITY_ID[minSeverity]))
      // **The window is computed here, not in a memo.** `Date.now()` during
      // render is impure and React's lint says so; taking it at fetch time is
      // also the more correct clock - "the last 24 hours" should mean the 24
      // hours before the request, not before the component happened to render.
      const hours = RANGES.find((one) => one.key === range)?.hours
      if (hours) at.set('since', new Date(Date.now() - hours * 3600_000).toISOString())
      // **No `/api` here.** `request` prepends `API_BASE`, so the whole path
      // produces `/api/api/...`, which the SPA catch-all answers with
      // `Cannot GET` rather than anything a reader would call a client bug.
      return request<AuditPage>(`/install/activity?${at.toString()}`)
    },
    // Keeps the page on screen while the next loads, so the table does not
    // collapse to a skeleton on every press of Next.
    placeholderData: keepPreviousData,
  })

  const reset = useCallback(() => {
    setTrail([''])
  }, [])

  const next = useCallback(() => {
    const onward = query.data?.nextCursor
    if (onward) setTrail((was) => [...was, onward])
  }, [query.data])

  const previous = useCallback(() => {
    setTrail((was) => (was.length > 1 ? was.slice(0, -1) : was))
  }, [])

  return {
    page: query.data,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch()
    },
    pageNumber: trail.length,
    hasPrevious: trail.length > 1,
    hasNext: Boolean(query.data?.nextCursor),
    next,
    previous,
    reset,
  }
}

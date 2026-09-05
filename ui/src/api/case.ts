/**
 * Reads, typed against `model.ts` - the server's own `domain/wire.ts` read
 * through `@contract/*`.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import type { Case, CollectionEntry, CollectionName } from './model'
import type { CaseCollection } from '@contract/collections'
import { keys } from './queryKeys'

/**
 * What `GET /cases` serves per case, without opening any of them.
 */
export interface CaseSummary {
  /**
   * Generated, and **not shown to anyone**.
   */
  id: string

  /** The customer's own ITSM ticket. Null until there is one. */
  reference: string | null
  customer: string | null

  /** The line the picker shows. Was `description`. */
  title: string
  /** A paragraph, shown where there is room for one. Null until written. */
  summary: string | null
  status: string

  /** ISO-8601. The *incident's* clock, not the row's - see the server schema. */
  openedAt: string
  /** `null` while the case is open - distinct from a closed case with no time. */
  closedAt: string | null

  /** Reset on every server restart; writes to it are not kept. */
  isDemo: boolean

  /**
   * **What a write must present back.**
   */
  version: number

  /** ISO-8601. The server's answer to when this row last changed. */
  updatedAt: string
}

export function useCases(): UseQueryResult<CaseSummary[]> {
  return useQuery({
    queryKey: keys.cases(),
    queryFn: () => request<CaseSummary[]>('/cases'),
  })
}

/**
 * The case as the Node backend serves it.
 */
export type CaseDetail = Case & {
  id: string
  title: string
  reference: string | null
  customer: string | null
  isDemo: boolean
  version: number
}

/**
 * The whole case document - twelve collections, 116,894 bytes on the largest
 * demo case.
 */
export function useCase(caseId: string, enabled = true): UseQueryResult<CaseDetail> {
  return useQuery({
    queryKey: keys.case(caseId),
    queryFn: () => request<CaseDetail>(`/cases/${encodeURIComponent(caseId)}`),
    enabled,
  })
}

/**
 * What the rail draws, without the rows it draws them from.
 */
export interface CaseRailSummary {
  id: string
  title: string
  reference: string | null
  customer: string | null
  isDemo: boolean
  version: number
  counts: Record<CaseCollection, number>
  attention: Partial<Record<CaseCollection, number>>
  reports: { id: string; label: string; sentAt: string | null }[]
}

/**
 * The rail's read, and the one every case screen makes.
 */
export function useCaseSummary(caseId: string): UseQueryResult<CaseRailSummary> {
  return useQuery({
    queryKey: keys.summary(caseId),
    queryFn: () => request<CaseRailSummary>(`/cases/${encodeURIComponent(caseId)}/summary`),
  })
}

/**
 * One table, read on its own.
 */
export function useCollection<N extends CollectionName>(
  caseId: string,
  collection: N,
): UseQueryResult<CollectionEntry[N][]> {
  return useQuery({
    queryKey: keys.collection(caseId, collection),
    queryFn: () =>
      request<CollectionEntry[N][]>(
        `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}`,
      ),
  })
}

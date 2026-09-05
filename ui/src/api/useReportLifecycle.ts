/**
 * Send, supersede and restore-sections: the three report writes that are not
 * field writes.
 */

import {
  useMutation, useQuery, useQueryClient,
  type UseMutationResult, type UseQueryResult,
} from '@tanstack/react-query'

import { request, type ApiError } from './client'
import { keys } from './queryKeys'

/** One section a layout requires, titled in the report's own language. */
export interface MissingSection {
  kind: string
  heading: string
}

export interface ReportGaps {
  id: string
  missing: MissingSection[]
}

/**
 * What this report's layout requires and it no longer holds.
 */
export function useReportGaps(
  caseId: string, reportId: string,
): UseQueryResult<ReportGaps> {
  return useQuery({
    queryKey: [...keys.case(caseId), 'report-gaps', reportId],
    queryFn: () =>
      request<ReportGaps>(
        `/cases/${encodeURIComponent(caseId)}/reports/${encodeURIComponent(reportId)}/missing-sections`,
      ),
    enabled: Boolean(caseId && reportId),
  })
}

/** Where the painter breaks the pages, section by section. */
export interface PageRuler {
  pages: number
  sections: { index: number; heading: string; page: number }[]
}

/**
 * The page each section starts on, for a surface drawing real boundaries.
 */
export function useReportPageRuler(
  caseId: string, reportId: string, language: string,
): UseQueryResult<PageRuler> {
  return useQuery({
    queryKey: [...keys.case(caseId), 'page-ruler', reportId, language],
    queryFn: () =>
      request<PageRuler>(
        `/cases/${encodeURIComponent(caseId)}/reports/${encodeURIComponent(reportId)}/page-ruler`
        + (language ? `?lang=${encodeURIComponent(language)}` : ''),
      ),
    enabled: Boolean(caseId && reportId),
  })
}

/** What `send` answers: the stamp it wrote and the size of what it froze. */
export interface SentReport {
  id: string
  sentAt: string
  /**
   * How many sections were frozen.
   */
  sections: number
}

/** What `supersede` answers: the successor's id, and the report it followed. */
export interface SupersededReport {
  id: string
  superseded: string
}

/**
 * What `restore-sections` answers: the sections it added, empty for a no-op.
 */
export interface RestoredSections {
  id: string
  restored: MissingSection[]
}

function lifecycle<T>(caseId: string, reportId: string, action: string): Promise<T> {
  return request<T>(
    `/cases/${encodeURIComponent(caseId)}/reports/${encodeURIComponent(reportId)}/${action}`,
    { method: 'POST' },
  )
}

/**
 * Mark a report sent, freezing the document with it.
 */
export function useSendReport(
  caseId: string,
): UseMutationResult<SentReport, ApiError, { reportId: string }> {
  const client = useQueryClient()

  return useMutation<SentReport, ApiError, { reportId: string }>({
    mutationFn: ({ reportId }) => lifecycle<SentReport>(caseId, reportId, 'send'),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

/** Mint a successor carrying this report's layout, marking and sections. */
export function useSupersedeReport(
  caseId: string,
): UseMutationResult<SupersededReport, ApiError, { reportId: string }> {
  const client = useQueryClient()

  return useMutation<SupersededReport, ApiError, { reportId: string }>({
    mutationFn: ({ reportId }) =>
      lifecycle<SupersededReport>(caseId, reportId, 'supersede'),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

/**
 * Add back the sections this report's layout marks required and it has lost.
 */
export function useRestoreReportSections(
  caseId: string,
): UseMutationResult<RestoredSections, ApiError, { reportId: string }> {
  const client = useQueryClient()

  return useMutation<RestoredSections, ApiError, { reportId: string }>({
    mutationFn: ({ reportId }) =>
      lifecycle<RestoredSections>(caseId, reportId, 'restore-sections'),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

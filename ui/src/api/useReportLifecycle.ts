/**
 * Send, supersede and restore-sections: the three report writes that are not
 * field writes.
 *
 * **None of these is expressible as a PATCH, and `send` is the one where that
 * matters.** `sent_at` *is* patchable, and a report also stores `frozen` - the
 * whole document as it stood when it left - which no client can render. Setting
 * the stamp through the collection route therefore produces a report that is
 * filed, frozen to nothing, and has no unlock. The screen offers this instead,
 * and offers no control that writes `sent_at` directly.
 *
 * **Invalidates the case key, not a report key.** Superseding adds a report
 * *and* a block per section it copies, and restoring adds blocks to a report
 * the caller is not necessarily looking at - so the blast radius is the case.
 *
 * **No optimistic row.** Each answer carries something the client cannot
 * predict: the frozen length, the successor's server-minted id, which sections
 * were missing. An optimistic version would be a second implementation of the
 * server's decision, which is the thing these routes exist to stop.
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
 *
 * **Served, not derived here.** Matching required specs against a report's
 * blocks needs the rule that identifies a generated section by kind and a
 * written one by heading; a second implementation is a second chance to
 * disagree about whether a document is short. The headings arrive rendered,
 * so the client only joins them into a sentence.
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
 *
 * **The heaviest read this screen makes** - the server lays out the whole PDF
 * to answer it, because pagination is only known once the document is built.
 * Left on the default staleness rather than `Infinity`: the breaks move
 * whenever the prose does, and a ruler describing the previous draft is worse
 * than none.
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
   *
   * **Sections, not characters.** The frozen artefact is a resolved node tree
   * rather than a markdown string, so there is no length to report and a
   * character count would describe a representation the server does not
   * produce.
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
 *
 * **The same shape `missing` arrives in**, so a screen naming what a report is
 * short of and a screen naming what was just put back read from one type. A
 * bare kind cannot name a written section at all - every one of them is
 * `written`, and the heading is the whole difference.
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
 *
 * A second call answers 409 rather than re-freezing - the recorded document is
 * the one that left, and re-rendering it is what the freeze prevents. The
 * caller renders that as "already sent", not as a failure to retry.
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
 *
 * Idempotent, so the control needs no enabled/disabled state of its own - a
 * second press answers `restored: []`.
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

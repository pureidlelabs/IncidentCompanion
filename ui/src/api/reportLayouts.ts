/**
 * `GET /api/report-layouts` - everything the New report form offers.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

/** `case_api.BLANK_LAYOUT` - the starting point that seeds nothing. */
export const BLANK_LAYOUT = '__blank__'

export interface LayoutBlock {
  kind: string
  position: number
  heading: string
  headingKey: string
  /** What the chip says: the resolved heading, in the language asked for. */
  label: string
}

export interface ReportLayout {
  name: string
  label: string
  /**
   * One line saying what the report is for and who reads it. Empty for a
   * dropped-in layout that wrote none, which the card draws as a title alone.
   */
  summary: string
  builtin: boolean
  /** Whether this layout belongs to the NIS2 regime, which decides whether
   *  a stage applies to it at all. */
  nis2: boolean
  /** The reporting step this layout is, where it is one of them. */
  stage?: string
  blocks: LayoutBlock[]
}

export interface ReportLayoutListing {
  layouts: ReportLayout[]
  /** `models.REPORT_STAGES`, leading empty for "no stage". */
  stages: string[]
  /** `models.TLP_LABELS`, leading empty for "unmarked". */
  tlp: string[]
  languages: { code: string; label: string }[]
  /** Every heading key the pack resolves, in the language asked for. */
  headings: { key: string; label: string }[]
}

export function useReportLayouts(language: string): UseQueryResult<ReportLayoutListing> {
  return useQuery({
    queryKey: keys.reportLayouts(language),
    queryFn: () => {
      const search = language ? `?lang=${encodeURIComponent(language)}` : ''
      return request<ReportLayoutListing>(`/report-layouts${search}`)
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

/**
 * `{headingKey: label}` over every served layout - the one place a client can
 * learn what `heading.exec_summary` is called.
 */
export function headingLabelsByKey(
  listing: ReportLayoutListing | undefined,
): Record<string, string> {
  // The pack's own map, not one rebuilt from the layouts, which would carry
  // only the keys some layout happened to use. Crosses as pairs, since these
  // keys are data.
  return Object.fromEntries((listing?.headings ?? []).map((pair) => [pair.key, pair.label]))
}

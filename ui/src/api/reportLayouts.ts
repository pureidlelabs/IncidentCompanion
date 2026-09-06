/**
 * `GET /api/report-layouts` - everything the New report form offers.
 *
 * Five registries and vocabularies in one document, because one screen reads
 * all five at once and a form assembled from five requests would show an
 * empty layout grid while four are still in flight. `staleTime: Infinity`
 * because these are constants for the life of this server process.
 *
 * Nothing here names a layout, style or language -- all three are the
 * library's to hold, so a client-side list means an analyst's own entry needs
 * a code change to appear.
 *
 * `blocks` is what a client seeds a new report with, `heading_key` included:
 * it comes off the template, and a report seeded without it ships English
 * written headings inside a Dutch document.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

/** `server/src/report/block-kinds.ts`'s `BLANK_LAYOUT` - the starting point
 *  that seeds nothing. */
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
  /** `domain/entities/report.ts`'s `REPORT_STAGES`, leading empty for "no stage". */
  stages: string[]
  /** `domain/entities/report.ts`'s `TLP_LABELS`, leading empty for "unmarked". */
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
 * `{headingKey: label}` over every served layout - the one place a client
 * can learn what `heading.exec_summary` is called. The block vocabulary
 * (`/api/report-block-kinds`) answers kind-to-label instead, a different
 * question: three written sections can share one kind and have three
 * headings.
 *
 * Served rather than derived, and keyed by the layouts a report can start
 * from -- a key belonging to no layout is not resolvable here either, which
 * is why the caller still needs its own fallback.
 */
export function headingLabelsByKey(
  listing: ReportLayoutListing | undefined,
): Record<string, string> {
  // The pack's own map, not one rebuilt from the layouts, which would carry
  // only the keys some layout happened to use. Crosses as pairs, since these
  // keys are data.
  return Object.fromEntries((listing?.headings ?? []).map((pair) => [pair.key, pair.label]))
}

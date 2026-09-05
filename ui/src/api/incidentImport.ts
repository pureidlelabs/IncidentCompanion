/**
 * The import calls, and the only thing the wizard knows about a case row.
 */
import type {
  Candidate,
  Imported,
  PreviewResult,
  RawIncident,
  TimelineCandidate,
} from '@contract/incident-import'

import { request } from './client'

export type { Candidate, Imported, PreviewResult, RawIncident, TimelineCandidate }

/** What the wizard has after `fetchDetail`, in the shape the server takes. */
export interface ImportPayload {
  provider: 'sentinel'
  incidents: RawIncident[]
}

/** What the analyst decided, on top of a payload. */
export interface ImportDecision {
  approved: string[]
  edits: { id: string; field: string; value: unknown }[]
}

/**
 * What this incident would add, judged against a case -- or against nothing.
 */
export function previewImport(caseId: string | null, payload: ImportPayload): Promise<PreviewResult> {
  const path = caseId ? `/cases/${encodeURIComponent(caseId)}/imports/preview` : '/imports/preview'
  return request<PreviewResult>(path, { method: 'POST', body: { ...payload } })
}

/** Write the approved rows into a case that exists. */
export function commitImport(
  caseId: string,
  payload: ImportPayload,
  decision: ImportDecision,
): Promise<Imported> {
  return request<Imported>(`/cases/${encodeURIComponent(caseId)}/imports`, {
    method: 'POST',
    body: { ...payload, ...decision },
  })
}

/** Create a case from this incident, and fill it in the same call. */
export function startCaseFromIncident(
  payload: ImportPayload,
  decision: ImportDecision,
  /**
   * What the case starts as.
   */
  kase: {
    title: string
    customer?: string
    reference?: string
    severity?: string | null
    detectedAt?: string | null
  },
): Promise<Imported & { caseId: string }> {
  return request<Imported & { caseId: string }>('/imports/case', {
    method: 'POST',
    body: { ...payload, ...decision, ...kase },
  })
}

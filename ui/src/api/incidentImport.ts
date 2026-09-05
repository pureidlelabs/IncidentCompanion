/**
 * The import calls, and the only thing the wizard knows about a case row.
 *
 * **The client stopped mapping.** It fetched the incident because it holds the
 * provider's token, and posts what the provider sent; the server parses it,
 * maps it onto the collections' own schemas, judges it against the case and
 * writes it. Everything this module carries is the server's shape, read as a
 * type -- so a body it cannot accept is a compile error rather than a 422 in
 * front of an analyst.
 *
 * -> `server/src/domain/incident-import.ts` for the shapes
 * -> `server/src/incident-import/` for what happens to them
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
 *
 * `caseId` is null for the door that starts a case: there is nothing to be a
 * duplicate of yet, and the same shape comes back so one review screen serves
 * both doors.
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
   * What the case starts as. **Severity and detected-at are the incident's**,
   * seeded by the wizard and correctable by the analyst -- a case created
   * without them loses what the provider already reported, which is the whole
   * reason the seed exists.
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

/**
 * The per-article compliance verdict for one case.
 *
 * **The verdict is the server's and this file renders none of it.** The
 * thresholds behind it are published figures checked against a vendored copy
 * of the Official Journal by `server/src/compliance/oj.test.ts`; recomputing
 * them here would be
 * a second implementation of a legal test with no such oracle, and the three
 * limbs that were wrong the first time they were written are the reason that
 * oracle exists.
 *
 * What the client owns is entirely how the answer reads - which is why this
 * carries the limbs and their citations rather than a badge.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import type { CaseCompliance as CaseComplianceFields } from '@contract/entities/case-compliance'

import { request, type ApiError } from './client'
import { keys } from './queryKeys'
import { rowKey, writeRow, type Read } from './rowWrite'

/**
 * One limb of a determination.
 *
 * `met` is three-valued and **null is not false**: "the case does not say yet"
 * and "this was tested and failed" are different findings, and a renderer that
 * collapses them tells the analyst a half-filled case has been assessed.
 */
export interface ComplianceCriterion {
  met: boolean | null
  label: string
  article: string
  detail: string
}

export interface ComplianceVerdict {
  regime: string
  article: string
  /** Three-valued, for the reason a criterion is. */
  verdict: boolean | null
  /** The test that was applied, in its own words. */
  rule: string
  /** Which instrument or threshold band this ran under. */
  detail: string
  criteria: ComplianceCriterion[]
  /** What this regime still lacks before it could be filed. Empty when ready. */
  readiness: string
}

export interface CaseCompliance {
  regimes: ComplianceVerdict[]
}

/**
 * **Not `staleTime: Infinity`.** A regime enters and leaves play as the
 * analyst fills the facts in, and every field on this screen is one of those
 * facts - a cached verdict is one that disagrees with the form beneath it.
 */
export function useCaseCompliance(caseId: string): UseQueryResult<CaseCompliance> {
  return useQuery({
    queryKey: [...keys.compliance(caseId), 'verdict'],
    queryFn: () =>
      request<CaseCompliance>(`/cases/${encodeURIComponent(caseId)}/compliance/verdict`),
    enabled: Boolean(caseId),
  })
}

/**
 * The record itself - the facts an analyst supplies, which the verdict above
 * is derived from.
 *
 * **Its own resource, and its own version.** The record is one row per case
 * with a version of its own, and `cases.version` does not move when a
 * threshold is answered - so writing these through the case PATCH would have
 * checked a version that had nothing to do with the field being written, and
 * two analysts filling different cards would both have passed it.
 */
export interface ComplianceRecord extends CaseComplianceFields {
  caseId: string
  version: number
  /**
   * **Kept, and not a loophole.** `ComplianceControl` walks the served field
   * specs and reads `record[spec.name]`, so the record has to be indexable by a
   * name that is a value rather than a literal; the 49 declared fields above are
   * what a *reader* gets, and this is what the control's generic walk needs.
   * Every declared member is assignable to `unknown`, so nothing is widened.
   */
  [key: string]: unknown
}

export function useComplianceRecord(caseId: string): UseQueryResult<ComplianceRecord> {
  return useQuery({
    queryKey: [...keys.compliance(caseId), 'record'],
    queryFn: () =>
      request<ComplianceRecord>(`/cases/${encodeURIComponent(caseId)}/compliance`),
    enabled: Boolean(caseId),
  })
}

/** One write to the record: the answers, and the version of the record they were read at. */
export interface ComplianceWrite {
  version: Read
  fields: Record<string, unknown>
}

/**
 * Write answers to the record.
 *
 * **The verdict is invalidated too.** Every field here is an input to it, so a
 * verdict left cached is one that disagrees with the form beneath it.
 */
export function useComplianceMutation(
  caseId: string,
): UseMutationResult<ComplianceRecord, ApiError, ComplianceWrite> {
  const client = useQueryClient()

  return useMutation<ComplianceRecord, ApiError, ComplianceWrite>({
    mutationKey: [...keys.compliance(caseId), 'record', 'patch'],

    mutationFn: ({ version, fields }) =>
      writeRow(
        client,
        rowKey(caseId, 'case_compliance', caseId),
        version,
        (at) =>
          request<ComplianceRecord>(`/cases/${encodeURIComponent(caseId)}/compliance`, {
            method: 'PATCH',
            body: { ...fields, version: at },
          }),
        (stored) => stored.version,
      ),

    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.compliance(caseId) })
    },
  })
}

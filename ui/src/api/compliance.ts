/**
 * The per-article compliance verdict for one case.
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

/**
 * One limb of a determination.
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
 * **Not `staleTime: Infinity`.**
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
 */
export interface ComplianceRecord extends CaseComplianceFields {
  caseId: string
  version: number
  /**
   * **Kept, and not a loophole.**
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

/**
 * Write one field of the record.
 */
export function useComplianceMutation(
  caseId: string,
): UseMutationResult<ComplianceRecord, ApiError, Record<string, unknown>, { previous: ComplianceRecord | undefined }> {
  const client = useQueryClient()
  const recordKey = [...keys.compliance(caseId), 'record']

  return useMutation<
    ComplianceRecord,
    ApiError,
    Record<string, unknown>,
    { previous: ComplianceRecord | undefined }
  >({
    mutationKey: [...recordKey, 'patch'],

    mutationFn: (fields) => {
      const held = client.getQueryData<ComplianceRecord>(recordKey)
      return request<ComplianceRecord>(`/cases/${encodeURIComponent(caseId)}/compliance`, {
        method: 'PATCH',
        body: { ...fields, version: held?.version },
      })
    },

    onMutate: async (fields) => {
      await client.cancelQueries({ queryKey: recordKey })
      const previous = client.getQueryData<ComplianceRecord>(recordKey)
      client.setQueryData<ComplianceRecord>(recordKey, (current) =>
        current ? { ...current, ...fields } : current,
      )
      return { previous }
    },

    onError: (_error, _fields, context) => {
      if (context) client.setQueryData(recordKey, context.previous)
    },

    // **Replaced rather than merged**, because the answer carries the version
    // the next write has to name. Merging the patch alone leaves the cache
    // holding the version this write consumed, and the second field an analyst
    // fills is refused as a conflict.
    onSuccess: (row) => {
      client.setQueryData<ComplianceRecord>(recordKey, row)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.compliance(caseId) })
    },
  })
}

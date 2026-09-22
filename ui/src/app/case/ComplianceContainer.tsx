import { useState } from 'react'

import { useCaseCompliance, useComplianceMutation, useComplianceRecord } from '@/api/compliance'
import { useRegimes } from '@/api/regimes'
import { useSpecs } from '@/api/specs'
import { useCaseId } from '@/app/useCaseId'
import { ComplianceScreen, type ComplianceWrites } from '@/screens/compliance'

import { announced } from './entryWrites'

/**
 * `ComplianceScreen` bound to the record it draws and the answers it writes.
 *
 * **Nothing converts on the way out.** `ComplianceControl` emits the stored
 * shape already -- `string[]` for the multi kinds, `null` for an emptied
 * number or stamp or a ground taken back. A conversion here would take a `multi_lines` answer through
 * `String(['a','b'])` and split it on a newline, storing one element with a
 * comma in it.
 */
export function ComplianceContainer() {
  const caseId = useCaseId()
  const record = useComplianceRecord(caseId)
  const specs = useSpecs()
  const regimes = useRegimes()
  const verdicts = useCaseCompliance(caseId)
  const patch = useComplianceMutation(caseId)

  /** The last answer another analyst got in first with, drawn above the cards. */
  const [refusal, setRefusal] = useState<{ field: string; by: string } | undefined>(undefined)

  const writes: ComplianceWrites = {
    save: (spec, value) => {
      setRefusal(undefined)
      return announced('the compliance record', () => patch.mutateAsync({ [spec.name]: value }), {
        refused: (error) => {
          setRefusal({
            field: spec.label,
            by: (error.body as { heldBy?: string } | null)?.heldBy ?? 'Another analyst',
          })
        },
      })
    },
  }

  return (
    <ComplianceScreen
      record={record.data}
      specs={specs.data}
      regimes={regimes.data}
      {...(refusal === undefined ? {} : { refusal })}
      {...(verdicts.data ? { verdicts: verdicts.data.regimes } : {})}
      busy={record.isPending || specs.isPending || regimes.isPending}
      {...(record.error === null ? {} : { problem: record.error })}
      onRetry={() => {
        void record.refetch()
        void specs.refetch()
        void regimes.refetch()
      }}
      writes={writes}
    />
  )
}

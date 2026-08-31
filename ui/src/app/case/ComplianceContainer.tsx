import { useCaseCompliance, useComplianceMutation, useComplianceRecord } from '@/api/compliance'
import { useRegimes } from '@/api/regimes'
import { useSpecs } from '@/api/specs'
import { useCaseId } from '@/app/useCaseId'
import { ComplianceScreen, type ComplianceWrites } from '@/screens/compliance'

import { announcing } from './entryWrites'

/**
 * `ComplianceScreen` bound to the record it draws and the answers it writes.
 *
 * **No `wireValue`, and that is the difference from `ComplianceSection`.**
 * That tier's control emitted a joined string for every kind and `wireValue`
 * split it; `ComplianceControl` emits the stored shape already -- `string[]`
 * for the multi kinds, `null` for an emptied number. Converting again would
 * take a `multi_lines` answer through `String(['a','b'])` and split it on a
 * newline, storing one element with a comma in it.
 */
export function ComplianceContainer() {
  const caseId = useCaseId()
  const record = useComplianceRecord(caseId)
  const specs = useSpecs()
  const regimes = useRegimes()
  const verdicts = useCaseCompliance(caseId)
  const patch = useComplianceMutation(caseId)

  const writes: ComplianceWrites = {
    save: (spec, value) =>
      announcing('the compliance record', () =>
        patch.mutateAsync({ [spec.name]: value }),
      ),
  }

  return (
    <ComplianceScreen
      record={record.data}
      specs={specs.data}
      regimes={regimes.data}
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

import { useNavigate } from 'react-router-dom'

import { useCase } from '@/api/case'
import { useComplianceRecord } from '@/api/compliance'
import { useSpecs } from '@/api/specs'
import { useCaseMutation } from '@/api/useCaseMutation'
import { useCaseId } from '@/app/useCaseId'
import { OverviewScreen } from '@/screens/overview'

import { announcing } from './entryWrites'

import type { CaseWrites } from '@/components/blocks/case-record-form'

/**
 * `OverviewScreen` bound to the case it draws and the fields it writes.
 *
 * **This is the settings screen too.** The rail offers `overview` and
 * `settings` as two rows and both render this one screen, which is what the
 * section registry already did.
 *
 * One `useCaseMutation` shared by every field: the hook does the
 * cancel/snapshot/apply/rollback per call, and a second field committing while
 * the first is in flight is two `mutate()` calls against one cache key rather
 * than two hooks.
 */
export function OverviewContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()
  const record = useComplianceRecord(caseId)
  const navigate = useNavigate()
  const patch = useCaseMutation(caseId)

  const writes: CaseWrites = {
    // The version travels from the form rather than from `kase.data`: the form
    // was drawn at one, and re-reading here would adopt whatever another
    // analyst wrote in between as the base this write claims to have seen.
    save: (field, value, version) =>
      announcing('the case', () => patch.mutateAsync({ version, fields: { [field]: value } })),
  }

  return (
    <OverviewScreen
      kase={kase.data}
      specs={specs.data}
      record={record.data}
      busy={kase.isPending || specs.isPending}
      {...(kase.error === null ? {} : { problem: kase.error })}
      onRetry={() => {
        void kase.refetch()
      }}
      onOpen={(row) => {
        void navigate(`/cases/${encodeURIComponent(caseId)}/${row.section}`)
      }}
      writes={writes}
    />
  )
}

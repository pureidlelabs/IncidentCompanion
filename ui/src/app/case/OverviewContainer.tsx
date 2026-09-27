import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useCase } from '@/api/case'
import { useComplianceRecord } from '@/api/compliance'
import { useSpecs } from '@/api/specs'
import { useCaseMutation } from '@/api/useCaseMutation'
import { useCaseId } from '@/app/useCaseId'
import { casePath } from '@/components/blocks/case-paths'
import { OverviewScreen } from '@/screens/overview'

import type { CaseWrites } from '@/components/blocks/case-record-form'

/**
 * `OverviewScreen` bound to the case it draws and the fields it writes.
 *
 * **This is the settings screen too.** The rail offers `overview` and
 * `settings` as two rows and both render this one screen, which is what the
 * section registry already did.
 */
export function OverviewContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()
  const record = useComplianceRecord(caseId)
  const navigate = useNavigate()
  const [address, setAddress] = useSearchParams()
  const field = (address.get('field') ?? '').trim()
  const patch = useCaseMutation(caseId)
  // Read once, so the reading holds for the mount.
  const [now] = useState(() => Date.now())

  // A door is spent once the pane it named has the cursor, and the form takes
  // it in its own effect, which runs before this one. Left in the address it is
  // taken again every time the analyst comes back to the tab.
  useEffect(() => {
    if (field !== '') setAddress({}, { replace: true })
  }, [field, setAddress])

  const writes: CaseWrites = {
    save: (fields, version) => patch.mutateAsync({ version, fields }),
  }

  return (
    <OverviewScreen
      kase={kase.data}
      specs={specs.data}
      record={record.data}
      now={now}
      busy={kase.isPending || specs.isPending}
      {...(kase.error === null ? {} : { problem: kase.error })}
      onRetry={() => {
        void kase.refetch()
      }}
      focusField={field === '' ? undefined : field}
      onOpen={(row) => {
        const to = casePath(caseId, row.section)
        void navigate(row.query === '' ? to : `${to}?${row.query}`)
      }}
      writes={writes}
    />
  )
}

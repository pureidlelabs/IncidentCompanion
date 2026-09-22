import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useCase } from '@/api/case'
import { useComplianceRecord } from '@/api/compliance'
import { formSpec, labelsOf, useSpecs } from '@/api/specs'
import { useCaseMutation } from '@/api/useCaseMutation'
import { useCaseId } from '@/app/useCaseId'
import { casePath } from '@/components/blocks/case-paths'
import { OverviewScreen } from '@/screens/overview'

import { announced } from './entryWrites'

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
  const [address, setAddress] = useSearchParams()
  const field = (address.get('field') ?? '').trim()
  const patch = useCaseMutation(caseId)
  // Read once, so the reading holds for the mount.
  const [now] = useState(() => Date.now())
  /** The last write another analyst got in first with, drawn above the fields. */
  const [refusal, setRefusal] = useState<{ field: string; by: string } | undefined>(undefined)
  // By label, because that is what the band names and what the screen finds the
  // pane by.
  const labels = useMemo(
    () => (specs.data ? labelsOf(formSpec(specs.data, 'CASE_FIELDS')) : {}),
    [specs.data],
  )

  // A door is spent once the pane it named has the cursor, and the form takes
  // it in its own effect, which runs before this one. Left in the address it is
  // taken again every time the analyst comes back to the tab.
  useEffect(() => {
    if (field !== '') setAddress({}, { replace: true })
  }, [field, setAddress])

  const writes: CaseWrites = {
    // The version travels from the form rather than from `kase.data`: the form
    // was drawn at one, and re-reading here would adopt whatever another
    // analyst wrote in between as the base this write claims to have seen.
    save: (field, value, version) => {
      setRefusal(undefined)
      return announced(
        'the case',
        () => patch.mutateAsync({ version, fields: { [field]: value } }),
        {
          // The merge review is the screen's answer to a 409, so the toast that
          // used to be the only one would say the same thing twice and name no
          // field. -> #1110
          refused: (error) => {
            setRefusal({
              field: labels[field] ?? field,
              by: (error.body as { heldBy?: string } | null)?.heldBy ?? 'Another analyst',
            })
          },
        },
      )
    },
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
      {...(refusal === undefined ? {} : { refusal })}
      focusField={field === '' ? undefined : field}
      onOpen={(row) => {
        const to = casePath(caseId, row.section)
        void navigate(row.query === '' ? to : `${to}?${row.query}`)
      }}
      writes={writes}
    />
  )
}

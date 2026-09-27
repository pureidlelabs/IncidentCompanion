import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useBulkPatch } from '@/api/useBulkPatch'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useBulkDelete } from '@/api/useBulkDelete'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useCaseId } from '@/app/useCaseId'
import { ImpactScreen, type ImpactWrites } from '@/screens/impact'

import { entryWrites } from './entryWrites'

export function ImpactContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()

  const writes = entryWrites<'impact'>(
    {
      create: useEntryCreate(caseId, 'impact'),
      patch: useEntryMutation(caseId, 'impact'),
      bulk: useBulkPatch(caseId, 'impact'),
      bulkDelete: useBulkDelete(caseId),
    },
    { one: 'the impact row', many: 'the selected rows' },
    async () => (await kase.refetch()).data?.impact ?? [],
    (row) => row.label,
    'impact',
  ) as ImpactWrites

  return (
    <ImpactScreen
      kase={kase.data}
      specs={specs.data}
      busy={kase.isPending || specs.isPending}
      {...(kase.error === null ? {} : { problem: kase.error })}
      onRetry={() => {
        void kase.refetch()
      }}
      writes={writes}
    />
  )
}

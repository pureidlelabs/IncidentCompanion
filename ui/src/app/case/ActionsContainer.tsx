import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useBulkPatch } from '@/api/useBulkPatch'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useEntryDelete } from '@/api/useEntryDelete'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useCaseId } from '@/app/useCaseId'
import { ActionsScreen, type ActionWrites } from '@/screens/actions'

import { entryWrites } from './entryWrites'

export function ActionsContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()

  const writes = entryWrites<'actions'>(
    {
      create: useEntryCreate(caseId, 'actions'),
      patch: useEntryMutation(caseId, 'actions'),
      bulk: useBulkPatch(caseId, 'actions'),
      remove: useEntryDelete(caseId, 'actions'),
    },
    { one: 'the task', many: 'the selected tasks' },
    () => kase.data?.actions ?? [],
    async () => (await kase.refetch()).data?.actions ?? [],
  ) as ActionWrites

  return (
    <ActionsScreen
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

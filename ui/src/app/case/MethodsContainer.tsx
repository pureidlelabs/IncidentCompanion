import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useBulkPatch } from '@/api/useBulkPatch'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useEntryDelete } from '@/api/useEntryDelete'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useCaseId } from '@/app/useCaseId'
import { MethodsScreen, type MethodWrites } from '@/screens/methods'

import { entryWrites } from './entryWrites'

/**
 * `MethodsScreen` bound to the case it draws and the writes it makes.
 */
export function MethodsContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()

  const writes = entryWrites<'methods'>(
    {
      create: useEntryCreate(caseId, 'methods'),
      patch: useEntryMutation(caseId, 'methods'),
      bulk: useBulkPatch(caseId, 'methods'),
      remove: useEntryDelete(caseId, 'methods'),
    },
    { one: 'the method', many: 'the selected methods' },
    () => kase.data?.methods ?? [],
    async () => (await kase.refetch()).data?.methods ?? [],
  ) as MethodWrites

  return (
    <MethodsScreen
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

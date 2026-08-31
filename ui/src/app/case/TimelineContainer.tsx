import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useEntryDelete } from '@/api/useEntryDelete'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useCaseId } from '@/app/useCaseId'
import { TimelineScreen, type TimelineWrites } from '@/screens/timeline'

import { announcing } from './entryWrites'

/**
 * `TimelineScreen` bound to the case it draws and the writes it makes.
 *
 * **Not `entryWrites`.** Timeline's contract is the one that differs: a save
 * carries which of the two forms produced it, and there is no bulk patch --
 * the screen offers no multi-row edit. Sharing the helper here would mean a
 * parameter every other collection passes `undefined` for.
 *
 * `kind` is a column rather than a second collection, so it rides with the
 * fields; `isEvent` reads it back off the stored row.
 */
export function TimelineContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()

  const create = useEntryCreate(caseId, 'timeline')
  const patch = useEntryMutation(caseId, 'timeline')
  const remove = useEntryDelete(caseId, 'timeline')

  const writes: TimelineWrites = {
    save: (entry, fields, kind) =>
      announcing('the entry', () =>
        entry === null
          ? create.mutateAsync({ fields: { ...fields, kind } })
          : patch.mutateAsync({
              entryId: entry.id,
              version: entry.version,
              fields: { ...fields, kind },
              base: entry,
            }),
      ),

    remove: async (ids) => {
      // One at a time: the version check is per row.
      for (const id of ids) {
        const row = kase.data?.timeline.find((one) => one.id === id)
        await announcing('the entry', () =>
          remove.mutateAsync({ entryId: id, version: row?.version ?? 0 }),
        )
      }
    },
  }

  return (
    <TimelineScreen
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

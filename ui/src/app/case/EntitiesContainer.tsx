import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useEntryDelete } from '@/api/useEntryDelete'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useCaseId } from '@/app/useCaseId'
import { EntitiesScreen } from '@/screens/entities'

import { announcing } from './entryWrites'

import type { EntityWrites } from '@/components/blocks/entity-scope-table'
import type { CollectionName } from '@/api/model'
import type { EntityScope } from '@/components/blocks/entity-scope'

/**
 * The entity family, bound to the case it draws and the writes it makes.
 *
 * **One container for six screens.** Assets, accounts, network, malware and
 * cloud apps are the same block at a different `scope`, and the unscoped view
 * spans all five -- so the mutations are the same five sets whichever slug is
 * open, and a container per slug would be five copies of this file.
 *
 * The five hook triples are called unconditionally and by name rather than in
 * a loop: `ENTITY_KINDS` is a constant of five, but a hook reached through it
 * reads as conditional to anyone auditing this file.
 */
export function EntitiesContainer({ scope }: { scope?: EntityScope } = {}) {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()

  const rows: Record<
    CollectionName,
    | {
        create: ReturnType<typeof useEntryCreate>
        patch: ReturnType<typeof useEntryMutation>
        remove: ReturnType<typeof useEntryDelete>
      }
    | undefined
  > = {
    systems: {
      create: useEntryCreate(caseId, 'systems'),
      patch: useEntryMutation(caseId, 'systems'),
      remove: useEntryDelete(caseId, 'systems'),
    },
    accounts: {
      create: useEntryCreate(caseId, 'accounts'),
      patch: useEntryMutation(caseId, 'accounts'),
      remove: useEntryDelete(caseId, 'accounts'),
    },
    network_indicators: {
      create: useEntryCreate(caseId, 'network_indicators'),
      patch: useEntryMutation(caseId, 'network_indicators'),
      remove: useEntryDelete(caseId, 'network_indicators'),
    },
    malware: {
      create: useEntryCreate(caseId, 'malware'),
      patch: useEntryMutation(caseId, 'malware'),
      remove: useEntryDelete(caseId, 'malware'),
    },
    cloud_apps: {
      create: useEntryCreate(caseId, 'cloud_apps'),
      patch: useEntryMutation(caseId, 'cloud_apps'),
      remove: useEntryDelete(caseId, 'cloud_apps'),
    },
  } as Record<CollectionName, never>

  const writes: EntityWrites = {
    save: (collection, entry, fields) => {
      const hooks = rows[collection]
      if (!hooks) return Promise.reject(new Error(`No write path for ${collection}`))
      return announcing('the entity', () =>
        entry === null
          ? hooks.create.mutateAsync({ fields })
          : hooks.patch.mutateAsync({
              entryId: entry.id,
              version: entry.version,
              fields,
              base: entry,
            }),
      )
    },

    remove: async (doomed) => {
      // One at a time: the version check is per row, and a refusal names
      // which row it was.
      for (const row of doomed) {
        const hooks = rows[row.collection]
        if (!hooks) continue
        await announcing('the entity', () =>
          hooks.remove.mutateAsync({ entryId: row.id, version: row.version }),
        )
      }
    },
  }

  return (
    <EntitiesScreen
      kase={kase.data}
      specs={specs.data}
      {...(scope ? { scope } : {})}
      busy={kase.isPending || specs.isPending}
      {...(kase.error === null ? {} : { problem: kase.error })}
      onRetry={() => {
        void kase.refetch()
      }}
      writes={writes}
    />
  )
}

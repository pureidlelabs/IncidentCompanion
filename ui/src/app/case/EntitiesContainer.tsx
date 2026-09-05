import { useLocation, useNavigate } from 'react-router-dom'

import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useEntryDelete } from '@/api/useEntryDelete'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useCaseId } from '@/app/useCaseId'
import { kindFor } from '@/components/blocks/entity-scope'
import { EntitiesScreen } from '@/screens/entities'

import { announcing } from './entryWrites'

import type { EntityWrites } from '@/components/blocks/entity-scope-table'
import type { CollectionName } from '@/api/model'
import type { EntityScope } from '@/components/blocks/entity-scope'

/**
 * The entity family, bound to the case it draws and the writes it makes.
 */
export function EntitiesContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()
  const { hash } = useLocation()
  const navigate = useNavigate()

  // An unrecognised fragment is `all` rather than a refusal: nothing else on a
  // URL is the analyst's to get right, and a typed one is worth no screen.
  const named = hash.slice(1)
  const scope: EntityScope = kindFor(named) ? (named as EntityScope) : 'all'

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
      scope={scope}
      // `replace`, because a kind is a view of one page rather than a place:
      // stacking one entry per tab press makes Back walk the kinds an analyst
      // clicked through instead of leaving the section.
      onScope={(next) => {
        void navigate({ hash: `#${next}` }, { replace: true })
      }}
      busy={kase.isPending || specs.isPending}
      {...(kase.error === null ? {} : { problem: kase.error })}
      onRetry={() => {
        void kase.refetch()
      }}
      writes={writes}
    />
  )
}

import { useLocation, useNavigate } from 'react-router-dom'

import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useEntryDelete } from '@/api/useEntryDelete'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useBulkDelete } from '@/api/useBulkDelete'
import { reportBulkMissing } from '@/components/blocks/notify'
import { useCaseId } from '@/app/useCaseId'
import { kindFor } from '@/components/blocks/entity-scope'
import { EntitiesScreen } from '@/screens/entities'

import { announcing } from './entryWrites'

import type { EntityWrites } from '@/components/blocks/entity-scope-table'
import type { CollectionName } from '@/api/model'
import type { EntityScope } from '@/components/blocks/entity-scope'

/**
 * The entity family, bound to the case it draws and the writes it makes.
 *
 * **One page, and the kind on screen is the fragment.** Assets, accounts,
 * network, malware and cloud apps are the same block at a different `scope`,
 * and the unscoped view spans all five -- so the mutations are the same five
 * sets whichever kind is open.
 *
 * **The fragment is the address and the block holds the state.** Routing is
 * the container's business here as everywhere: the block is drawn in the
 * gallery, where there is no router to ask.
 *
 * The five hook triples are called unconditionally and by name rather than in
 * a loop: `ENTITY_KINDS` is a constant of five, but a hook reached through it
 * reads as conditional to anyone auditing this file.
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

  const bulkDelete = useBulkDelete(caseId)

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
      /**
       * **One request, because order would otherwise decide the outcome.**
       * Malware names a system, so a loop deleting the asset first is refused
       * and one deleting the malware first is not. The route counts references
       * against what survives the call, which no loop here can express -- and
       * a loop also half-deletes, stopping at the first refusal with the rest
       * already gone. -> `api/useBulkDelete.ts`, #665
       */
      // **The version each row was read at travels with it**, so a row another
      // analyst has edited since is refused rather than deleted. -> #682
      const targets: Partial<Record<CollectionName, { id: string; version: number }[]>> = {}
      for (const row of doomed) {
        ;(targets[row.collection] ??= []).push({ id: row.id, version: row.version })
      }
      if (Object.keys(targets).length === 0) return
      const written = await announcing('the entities', () => bulkDelete.mutateAsync({ targets }))
      // **Told, not discarded.** A row another analyst had already deleted
      // comes back under `missing`, and an analyst who selected six and lost
      // two of them silently has no way to know which case they are looking at.
      reportBulkMissing(
        written.missing.map((row) => row.id),
        'entities',
      )
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

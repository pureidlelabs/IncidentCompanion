/**
 * Which rows of one table have a write in flight.
 */

import { useMutationState } from '@tanstack/react-query'

import type { BulkPatchVars } from './useBulkPatch'
import type { CollectionName } from './model'
import { keys } from './queryKeys'
import type { EntryPatch } from './useEntryMutation'
import type { EntryRemoval } from './useEntryDelete'

function idsOf(variables: unknown): string[] {
  if (typeof variables !== 'object' || variables === null) return []
  const candidate = variables as Partial<
    EntryPatch<CollectionName> & EntryRemoval & BulkPatchVars<CollectionName>
  >
  if (typeof candidate.entryId === 'string') return [candidate.entryId]
  // **Two shapes reach this, and both are in the cache at once.** A delete
  // names bare ids; a bulk patch names rows. Returning the rows would fill the
  // set with values no row id equals, and every dimmed row would stop dimming.
  if (Array.isArray(candidate.ids)) {
    return (candidate.ids as (string | { id: string })[]).map((one) =>
      typeof one === 'string' ? one : one.id,
    )
  }
  return []
}

/**
 * Rows with a PATCH or DELETE in flight, by verb.
 */
export function usePendingEntryIds(
  caseId: string,
  collection: CollectionName,
): { writing: ReadonlySet<string>; deleting: ReadonlySet<string> } {
  const listKey = keys.collection(caseId, collection)

  const writing = useMutationState({
    filters: { mutationKey: [...listKey, 'patch'], status: 'pending' },
    select: (mutation) => idsOf(mutation.state.variables),
  })
  // Every id in a bulk PATCH dims the same way a single-row one does: the
  // request is in flight for all of them at once, not one after another.
  const bulkWriting = useMutationState({
    filters: { mutationKey: [...listKey, 'bulk-patch'], status: 'pending' },
    select: (mutation) => idsOf(mutation.state.variables),
  })
  const deleting = useMutationState({
    filters: { mutationKey: [...listKey, 'delete'], status: 'pending' },
    select: (mutation) => idsOf(mutation.state.variables),
  })

  return {
    writing: new Set([...writing, ...bulkWriting].flat()),
    deleting: new Set(deleting.flat()),
  }
}

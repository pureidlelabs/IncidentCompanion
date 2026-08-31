/**
 * Which rows of one table have a write in flight.
 *
 * `useMutation().isPending` is one boolean per hook, not per row. A section
 * holds one hook, so two analysts' worth of concurrent edits - or one analyst
 * editing quickly - collapse into a single spinner sitting on whichever row
 * `variables` last held. Reading the mutation *cache* instead gives every
 * in-flight call, and each one still carries its own `entryId`.
 *
 * Filtered by the mutation key rather than by status alone: another table's
 * writes are in the same cache.
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
  if (Array.isArray(candidate.ids)) return candidate.ids
  return []
}

/**
 * Rows with a PATCH or DELETE in flight, by verb.
 *
 * Two sets rather than one: a row being deleted has already left the list
 * optimistically, while a row being patched is still there and shown dimmed.
 * A caller that merged them would dim rows that are gone.
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

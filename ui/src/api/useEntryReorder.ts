/**
 * Set a whole table's order: optimistic resequence, POST, rollback on failure.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { CollectionEntry, CollectionName } from './model'
import { keys } from './queryKeys'

/** The field `case_api.ORDER_FIELD` rewrites. */
const ORDER_FIELD = 'position'

export interface EntryOrder {
  /** Every id in the table, exactly once, in the order wanted. */
  ids: string[]
}

/** The route echoes the ids it wrote. */
export interface ReorderedEntries {
  ids: string[]
}

interface OrderRollback<N extends CollectionName> {
  previous: CollectionEntry[N][] | undefined
}

/**
 * The id list that moves one entry to a new index among its peers.
 *
 * Returns `null` when the move is a no-op or out of range, which is what lets
 * a caller skip the request rather than send a reorder that changes nothing.
 */
export function moveWithin(
  peers: readonly { id: string }[],
  entryId: string,
  delta: number,
): string[] | null {
  const from = peers.findIndex((entry) => entry.id === entryId)
  if (from === -1) return null
  const to = from + delta
  if (to < 0 || to >= peers.length) return null

  const moved = peers.map((entry) => entry.id)
  const [taken] = moved.splice(from, 1)
  if (taken === undefined) return null
  moved.splice(to, 0, taken)
  return moved
}

/**
 * The rows as the reorder would leave them, or the rows unchanged.
 *
 * Extracted from `onMutate` because a test cannot see it there: `onMutate` is
 * async - it awaits `cancelQueries` first - so an assertion made straight after
 * `mutate()` reads the cache before the callback has touched it, and passes
 * whatever this returns. Deleting the guard left that test green.
 */
export function resequence<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const named = new Set(ids)
  const ordered: T[] = []
  for (const [index, entryId] of ids.entries()) {
    const row = byId.get(entryId)
    if (!row) return rows
    ordered.push(ORDER_FIELD in row ? { ...row, [ORDER_FIELD]: index } : row)
  }

  let next = 0
  return rows.map((row) => {
    if (!named.has(row.id)) return row
    // `named` is built from `ids` and `ordered` has one entry per id, so this
    // runs out only if `rows` repeats an id - a cache that cannot happen, and
    // a fallback rather than an assertion because the type cannot say so.
    return ordered[next++] ?? row
  })
}

export function useEntryReorder<N extends CollectionName>(
  caseId: string,
  collection: N,
): UseMutationResult<ReorderedEntries, ApiError, EntryOrder, OrderRollback<N>> {
  const client = useQueryClient()
  const listKey = keys.collection(caseId, collection)

  return useMutation<ReorderedEntries, ApiError, EntryOrder, OrderRollback<N>>({
    mutationKey: [...listKey, 'reorder'],

    mutationFn: ({ ids }) =>
      request<ReorderedEntries>(
        `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}/order`,
        { method: 'POST', body: { ids } },
      ),

    onMutate: async ({ ids }) => {
      await client.cancelQueries({ queryKey: listKey })
      const previous = client.getQueryData<CollectionEntry[N][]>(listKey)

      client.setQueryData<CollectionEntry[N][]>(listKey, (rows) =>
        rows ? resequence(rows as (CollectionEntry[N] & { id: string })[], ids) : rows,
      )
      return { previous }
    },

    onError: (_error, _order, context) => {
      if (context) client.setQueryData(listKey, context.previous)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: listKey })
      void client.invalidateQueries({ queryKey: keys.case(caseId) })
    },
  })
}

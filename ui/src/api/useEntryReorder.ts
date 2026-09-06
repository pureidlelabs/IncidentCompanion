/**
 * Set a whole table's order: optimistic resequence, POST, rollback on failure.
 *
 * Same skeleton as the other three writes - cancel, snapshot, apply, restore on
 * error, invalidate on settled - and the fourth of the four rather than a
 * generic over them, for the reason `useEntryCreate` gives.
 *
 * ## The list is one scope's rows, never the whole table
 *
 * A collection declaring `orderWithin` is ordered inside that column, and the
 * route takes one such scope at a time: it reads the scope off the rows named,
 * refuses a list spanning two of them, and then requires every row of that one
 * scope, once each. `report_blocks` is ordered within `reportId`, so a screen
 * showing one report sends that report's blocks and no others. A whole-case
 * payload is refused - 422 on the scope check, or 409 ahead of it - and
 * neither tier can see that alone: a client test is green on a payload the
 * server rejects, the server's is green on rejecting it, and a case holding
 * one report makes the two shapes identical.
 *
 * ## Positions are rewritten to 0..n-1, here as well as on the server
 *
 * The server renumbers rather than preserving the numbers it was given, so an
 * optimistic list that only reordered the array would show the new order while
 * every `position` still read the old one - and the next render, which sorts
 * by `position`, would put it back. The optimistic row carries the index it
 * lands at.
 *
 * ## What is not here
 *
 * No per-entry pending id. A reorder has no single subject, so
 * `usePendingEntryIds` cannot describe it and the caller reads `isPending`.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { request, type ApiError } from './client'
import type { CollectionEntry, CollectionName } from './model'
import { keys } from './queryKeys'

/** The field the collection definition names as its `position`. */
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
 * `peers` is one scope's rows, in the order the analyst sees them - for a
 * report, that report's blocks and no other's. The result is the same set in
 * the order wanted, which is exactly what the route takes.
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
 * whatever this returns. Deleting the guard leaves that test green.
 *
 * **The cache holds more than the reorder names.** `useCollection` is per case
 * and a reorder is per scope, so the named rows are placed back into the slots
 * they already occupy and everything else is left alone - a second report's
 * blocks keep both their order and their stored `position`.
 *
 * Unchanged when an id names no cached row: that row was created by somebody
 * else since this screen read the list, and placing the rest anyway would drop
 * it off the screen until the refetch, which reads as a delete rather than as
 * a reorder.
 *
 * **`position` is the index within the named set**, not within the cache,
 * because that is what the route writes - it stamps each row with its place in
 * the list it was posted. Numbering from the cache would show the new order
 * and then jump back on the refetch, which sorts by `position`.
 *
 * **And it is stamped only on rows that already carry one.** A collection the
 * server orders by something else has no such field; writing one anyway
 * invents a property the server never returns, so the refetch would silently
 * drop it and any code that started reading it would work optimistically and
 * break on the round trip. The array order is the
 * optimistic answer for those tables, and it is the one the screen renders.
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

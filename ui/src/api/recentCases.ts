/**
 * `/api/recent-cases` - the cases this analyst has been in, and their pins.
 *
 * **The server names the cases, so nothing here holds a title.** The list is a
 * join at read time; caching a title client-side would show the old one after
 * somebody renamed the case, which is the failure the uuid-only card avoided by
 * showing nothing readable at all.
 *
 * **An offer the picker draws, never something that navigates on its own.** A
 * hook that opened the top entry would fight the analyst who has just closed a
 * case to go and do something else.
 */

import { useEffect } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

export interface RecentCase {
  caseId: string
  title: string
  reference: string | null
  customer: string | null
  status: 'open' | 'closed'
  /** The rail section they were last in, or null if they never reached one. */
  section: string | null
  visitedAt: string
  pinned: boolean
}

export interface RecentCases {
  pinned: RecentCase[]
  recent: RecentCase[]
}

const EMPTY: RecentCases = { pinned: [], recent: [] }

export function useRecentCases(): UseQueryResult<RecentCases> {
  return useQuery({
    queryKey: keys.recentCases(),
    queryFn: () => request<RecentCases>('/recent-cases'),
    // One attempt: this decides whether an optional list exists, and a failure
    // is an answer ("offer nothing") rather than something worth three tries.
    retry: false,
  })
}

/**
 * Tell the server where this analyst is, whenever the case or section changes.
 *
 * **The client's half, and the list is empty without it.** This front end
 * routes between sections client-side and makes no per-section request, so
 * nothing on the server sees the navigation.
 *
 * **Fire-and-forget.** A failed record is a list one navigation stale, which is
 * not worth interrupting an analyst for - so no error surface, and no retry
 * that could arrive after they have moved on again. It does not invalidate the
 * list either: the only reader is the picker, which this analyst is not
 * looking at.
 */
export function useNoteVisit(caseId: string | undefined, section: string | undefined): void {
  useEffect(() => {
    if (!caseId) return
    void request(`/recent-cases/${encodeURIComponent(caseId)}`, {
      method: 'PUT',
      body: { section: section ?? null },
    }).catch(() => undefined)
  }, [caseId, section])
}

/**
 * Pin or unpin, from the picker.
 *
 * **Optimistic, because the pin is a toggle the analyst is looking at.** A
 * round trip before the icon fills reads as a control that did not take, and
 * the list is re-read on settle either way.
 */
export function usePinCase(): UseMutationResult<
  Record<string, never>,
  Error,
  { caseId: string; pinned: boolean },
  { previous: RecentCases | undefined }
> {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ caseId, pinned }: { caseId: string; pinned: boolean }) =>
      request<Record<string, never>>(`/recent-cases/${encodeURIComponent(caseId)}/pinned`, {
        method: 'PUT',
        body: { pinned },
      }),
    onMutate: async ({ caseId, pinned }) => {
      await client.cancelQueries({ queryKey: keys.recentCases() })
      const previous = client.getQueryData<RecentCases>(keys.recentCases())
      client.setQueryData<RecentCases>(keys.recentCases(), (held) =>
        movePin(held ?? EMPTY, caseId, pinned),
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      // Back to what the server last said, rather than to a guess: a refused
      // pin that stayed filled is a control the analyst believes worked.
      client.setQueryData(keys.recentCases(), context?.previous)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.recentCases() })
    },
  })
}

/** Forget one case, so the analyst can clear something they opened by mistake. */
export function useForgetCase(): UseMutationResult<Record<string, never>, Error, string> {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (caseId: string) =>
      request<Record<string, never>>(`/recent-cases/${encodeURIComponent(caseId)}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.recentCases() })
    },
  })
}

/**
 * Move one case between the two lists, for the optimistic update.
 *
 * **Exported for its own test.** The ordering is the part that can be wrong
 * while the request is right: a pin lands at the top of the pinned list because
 * the server orders by when it was pinned, and an unpin lands by `visitedAt`
 * among the rest rather than at the top.
 */
export function movePin(held: RecentCases, caseId: string, pinned: boolean): RecentCases {
  const all = [...held.pinned, ...held.recent]
  const row = all.find((one) => one.caseId === caseId)
  if (!row) return held

  const moved = { ...row, pinned }
  const others = all.filter((one) => one.caseId !== caseId)
  const rest = { pinned: others.filter((o) => o.pinned), recent: others.filter((o) => !o.pinned) }

  return pinned
    ? { pinned: [moved, ...rest.pinned], recent: rest.recent }
    : {
        pinned: rest.pinned,
        recent: [...rest.recent, moved].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)),
      }
}

/**
 * Put the cases this analyst has been in most recently first.
 *
 * **The switcher's order used to be `localStorage`**, and its own module said
 * so: `CaseSummary` carried no timestamp, so recency was a browser fact and the
 * second analyst on the same case saw a different list. It is a served fact
 * now, which is what makes one order true for everyone.
 *
 * **Pinned first, then by visit, then whatever the caller had.** A case nobody
 * has opened keeps the incoming order rather than being sorted by id - the
 * caller already asked the server for one.
 */
export function byRecency<T extends { id: string }>(
  cases: readonly T[],
  held: RecentCases | undefined,
): T[] {
  const rank = new Map<string, number>()
  const seen = [...(held?.pinned ?? []), ...(held?.recent ?? [])]
  seen.forEach((one, at) => {
    if (!rank.has(one.caseId)) rank.set(one.caseId, at)
  })

  return [...cases]
    .map((row, at) => ({ row, at }))
    .sort((a, b) => {
      const left = rank.get(a.row.id)
      const right = rank.get(b.row.id)
      if (left !== undefined && right !== undefined) return left - right
      if (left !== undefined) return -1
      if (right !== undefined) return 1
      return a.at - b.at
    })
    .map(({ row }) => row)
}

/**
 * What to show beside a pinned row's title so two rows can be told apart.
 *
 * **The reference and the customer first, and a short id only where it is
 * needed.** Two cases called `test` with nothing else set are otherwise the
 * same row twice - measured on screen, three pinned rows carrying two distinct
 * titles between them. A uuid is noise everywhere it is not the only
 * differentiator, which is why it appears on *neither* row until it is: a rule
 * that always showed it would put `6e41af15-265b-...` beside every case that
 * never needed it.
 *
 * **Both rows get the hint, not only the later one.** Marking one of a pair
 * reads as that row being special rather than as the pair being ambiguous.
 */
export function hintsFor(rows: readonly RecentCase[]): Map<string, string> {
  const named = rows.map((row) => ({
    caseId: row.caseId,
    // What the row already puts on screen - a collision here is a collision
    // the analyst sees, whatever else differs underneath.
    shown: [row.title, row.reference, row.customer].filter(Boolean).join(' \u00b7 '),
    natural: [row.reference, row.customer].filter(Boolean).join(' \u00b7 '),
  }))

  const seen = new Map<string, number>()
  for (const one of named) seen.set(one.shown, (seen.get(one.shown) ?? 0) + 1)

  return new Map(
    named.map((one) => [
      one.caseId,
      (seen.get(one.shown) ?? 0) > 1
        ? [one.natural, one.caseId.slice(0, 8)].filter(Boolean).join(' \u00b7 ')
        : one.natural,
    ]),
  )
}

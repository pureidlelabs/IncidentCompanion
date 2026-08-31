/**
 * Another analyst wrote something: refetch what they touched.
 *
 * **Without this the app is concurrent underneath and single-user on screen.**
 * Measured 2026-08-08 in a browser, with a reload as the control: a write made
 * elsewhere was invisible on a mounted timeline for over ten seconds and
 * appeared only after a reload. `staleTime` is 5s, `refetchOnWindowFocus` is
 * off and there is no refetch interval, so a table that is already mounted has
 * no route to anyone else's work.
 *
 * **A poll was the alternative and is worse in both directions**: an interval
 * short enough to feel live is a request per second per open case, and one
 * cheap enough to run is slower than the reload it replaces. The socket is
 * already open for presence.
 *
 * **Invalidate, never patch.** The frame says *which tables moved*, not what
 * changed in them - deliberately, because a client applying a row from the
 * wire is a second implementation of the read path, and the one on `GET` is
 * the one the report and the export agree with. Refetching is a request; being
 * wrong is a support call.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { acquireLink, releaseLink } from './caseSocket'
import { isScope } from '@contract/scopes.lists'

import { keys } from './queryKeys'

/**
 * How long announcements are gathered before refetching.
 *
 * **A burst absorber, not an interval.** One analyst's act is often several
 * writes - saving a dialog touches a row and its references, a bulk delete
 * announces per table - and invalidating on each arrival refetches the same
 * collection two or three times in a few hundred milliseconds, of which only
 * the last answer is ever seen. Short enough that a lone write still lands
 * within a frame or two.
 */
const COALESCE_MS = 120

/** Stands in for `scopes: null`, which means "assume everything moved". */
export const EVERYTHING = '\u0000everything'

/**
 * What a burst of announcements invalidates, as data.
 *
 * **Extracted so it can be asserted.** It used to be inline in an effect,
 * where the only way to check it was to mount the hook and watch a query
 * client - so the defect below sat in it unnoticed: nothing named the
 * whole-case document at all.
 */
export interface Invalidation {
  readonly queryKey: readonly unknown[]
  /** True to take that key alone; false or absent to take everything under it. */
  readonly exact?: boolean
}

export function invalidationsFor(caseId: string, scopes: readonly string[]): Invalidation[] {
  // The widest answer, and it must stay a prefix: the write could not say what
  // it touched, so every collection under the case goes with it.
  if (scopes.includes(EVERYTHING)) return [{ queryKey: keys.case(caseId) }]

  const out: Invalidation[] = [
    // **Every write moves it**, whichever table it touched, and the scoped
    // invalidations below would never name it. Stale attribution is the one
    // kind that actively misleads: it says the row is as this analyst left it
    // while somebody else has just changed it.
    { queryKey: keys.attribution(caseId) },
    /**
     * **The whole-case document, and this line is a fix.** TanStack matches by
     * prefix in one direction only - invalidating
     * `['case', id, 'collection', 'evidence']` leaves `['case', id]` untouched,
     * measured. `CaseShell` reads that key for the rail's count chips, the
     * title and the reports list, so before this another analyst's write moved
     * the rows and left the count beside them showing the old number, with
     * nothing to correct it short of a reload.
     *
     * **`exact`, or the cure is worse.** Without it this reaches all twelve
     * collections by prefix, and one keystroke in evidence would refetch the
     * timeline - 45,576 of the case document's 71,438 bytes.
     */
    { queryKey: keys.case(caseId), exact: true },
    /**
     * **The rail, and the `exact` above is exactly why this line exists.**
     * `keys.summary` sits under the case key, so taking that key alone leaves
     * it untouched - every count chip and the attention number would hold the
     * number the screen opened with while the rows beneath them moved. 1,464
     * bytes to refetch against the document's 116,894, so it is taken on every
     * write rather than scoped.
     */
    { queryKey: keys.summary(caseId) },
  ]

  for (const scope of scopes) {
    // **Checked, never cast.** Anything here arrived as a bare string off
    // the socket. A scope the client does not know produced
    // `['case', id, 'collection', <it>]` - a key no query reads, so the
    // invalidation ran and no screen refreshed. Dropping it loses precision
    // and keeps correctness: the three unconditional entries above still
    // refresh the case document, the summary and attribution.
    if (!isScope(scope)) continue
    // **`cases`, plural, which is what the server actually announces.** This
    // read `'case'` and matched nothing: every case-scalar write sends
    // `['cases']` (`cases.service.ts` patch and delete), so the string fell
    // through to `keys.collection(caseId, 'cases')` - a key no query ever
    // reads. The scalars are not a collection, and a scalar write is rare
    // enough to be generous about: take the whole subtree.
    // **A case-scalar write is already covered, so it adds nothing here.** The
    // three unconditional entries above take attribution, the document and the
    // summary; pushing the case key *without* `exact` takes the whole subtree
    // instead - measured against a client holding ten real keys, one announced
    // `['cases']` invalidated all ten against `['timeline']`'s four. The
    // Overview form commits one PATCH per field, so a four-field edit fanned
    // that out four times to every other analyst's open screen.
    if (scope === 'cases') continue
    // **Compliance is keyed outside the collection convention**, so the cast
    // below would make `['case', id, 'collection', 'case_compliance']` - a key
    // no query reads, leaving an open Compliance screen stale until it
    // remounts. Every other analyst's write is meant to repaint it.
    if (scope === 'case_compliance') {
      out.push({ queryKey: keys.compliance(caseId) })
      continue
    }
    out.push({ queryKey: keys.collection(caseId, scope) })
  }
  return out
}

/** What the server sends after a write it committed. */
export interface CaseChanged {
  /** The tables that moved, or `null` for "assume everything did". */
  scopes: string[] | null
  /** Who wrote it. Not used to skip -- `useCaseChanges` says why. */
  by: string
}

export function readChange(message: Record<string, unknown>): CaseChanged | null {
  if (message.type !== 'case.changed') return null
  const scopes = message.scopes
  return {
    scopes: Array.isArray(scopes) ? scopes.filter((s) => typeof s === 'string') : null,
    by: typeof message.by === 'string' ? message.by : '',
  }
}

/**
 * Live for the whole case, mounted once by the shell.
 *
 * Per-section would be the obvious shape and is the wrong one: a section that
 * is not currently rendered still holds a cached query, and it is the one the
 * analyst meets stale when they navigate back to it.
 */
export function useCaseChanges(caseId: string): void {
  const queries = useQueryClient()

  useEffect(() => {
    if (!caseId || typeof WebSocket === 'undefined') return undefined
    const link = acquireLink(caseId, (url) => new WebSocket(url))

    const pending = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | undefined

    const settle = () => {
      timer = undefined
      const scopes = [...pending]
      pending.clear()
      for (const one of invalidationsFor(caseId, scopes)) {
        void queries.invalidateQueries(
          one.exact ? { queryKey: one.queryKey, exact: true } : { queryKey: one.queryKey },
        )
      }
    }

    const stop = link.subscribe((message) => {
      const change = readChange(message)
      if (!change) return
      // **This analyst's own writes are invalidated too.** Telling them apart
      // means identifying a *tab*, and two tabs of one analyst are two
      // writers - the per-connection reasoning the roster exists to avoid.
      // The cost is one redundant refetch of data that is already fresh.
      for (const scope of change.scopes ?? [EVERYTHING]) pending.add(scope)
      timer ??= setTimeout(settle, COALESCE_MS)
    })

    return () => {
      stop()
      if (timer !== undefined) clearTimeout(timer)
      releaseLink(caseId)
    }
  }, [caseId, queries])
}

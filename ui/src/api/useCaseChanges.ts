/**
 * Another analyst wrote something: refetch what they touched.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { acquireLink, releaseLink } from './caseSocket'
import { isScope } from '@contract/scopes.lists'

import { keys } from './queryKeys'

/**
 * How long announcements are gathered before refetching.
 */
const COALESCE_MS = 120

/** Stands in for `scopes: null`, which means "assume everything moved". */
export const EVERYTHING = '\u0000everything'

/**
 * What a burst of announcements invalidates, as data.
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
     * **The whole-case document, and this line is a fix.**
     */
    { queryKey: keys.case(caseId), exact: true },
    /**
     * **The rail, and the `exact` above is exactly why this line exists.**
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

    /**
     * **A reconnect re-reads everything, because it cannot know what it
     * missed.**
     */
    let wasDown = false
    const stopWatching = link.onConnected((up) => {
      if (!up) {
        wasDown = true
        return
      }
      if (!wasDown) return
      wasDown = false
      pending.add(EVERYTHING)
      timer ??= setTimeout(settle, COALESCE_MS)
    })

    return () => {
      stop()
      stopWatching()
      if (timer !== undefined) clearTimeout(timer)
      releaseLink(caseId)
    }
  }, [caseId, queries])
}

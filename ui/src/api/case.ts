/**
 * Reads, typed against `model.ts` - the server's own `domain/wire.ts` read
 * through `@contract/*`.
 *
 * **`request<T>()` asserts; it does not validate.** The cast happens here, once
 * per endpoint, and is the only place this client claims a shape it did not
 * check. A schema change is a compile error, so what this cannot catch is a
 * *running* server older than the types.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import type { Case, CollectionEntry, CollectionName } from './model'
import type { CaseCollection } from '@contract/collections'
import { keys } from './queryKeys'

/**
 * What `GET /cases` serves per case, without opening any of them.
 *
 * Every field is read off the *cached* summary the server already holds, so
 * the listing takes no lock and cannot disturb an open case.
 *
 * **`lastModified` is the server's answer to when a case last changed, and it
 * is the one that matters once two analysts share a case** -
 * `api/recentCases.ts` orders by what *this browser* opened, and says in
 * its own docstring what that costs. Empty when the cache could not be read.
 */
export interface CaseSummary {
  /**
   * Generated, and **not shown to anyone**. An analyst-typed identifier lets
   * two of them race for one name and makes a typo permanent.
   */
  id: string

  /** The customer's own ITSM ticket. Null until there is one. */
  reference: string | null
  customer: string | null

  title: string
  /** A paragraph, shown where there is room for one. Null until written. */
  summary: string | null
  status: string

  /** ISO-8601. The *incident's* clock, not the row's - see the server schema. */
  openedAt: string
  /** `null` while the case is open - distinct from a closed case with no time. */
  closedAt: string | null

  /** A seeded demo case. The demo reseed deletes and rebuilds it, so writes to it are not kept. */
  isDemo: boolean

  /**
   * **What a write must present back.** Every field above is rendered; this one
   * is the token that makes the next save safe, and a screen that drops it can
   * only save by overwriting whatever arrived in the meantime.
   */
  version: number

  /** ISO-8601. The server's answer to when this row last changed. */
  updatedAt: string
}

export function useCases(): UseQueryResult<CaseSummary[]> {
  return useQuery({
    queryKey: keys.cases(),
    queryFn: () => request<CaseSummary[]>('/cases'),
  })
}

/**
 * The case as the Node backend serves it.
 *
 * **The intersection restates six fields `Case` already carries.**
 * `caseReadSchema` names all six (`id`, `title`, `reference`, `customer`,
 * `isDemo`, and `version` off the envelope) and `.required()` leaves none of
 * them optional, so this adds nothing a reader can rely on.
 * -> `server/src/domain/case.ts`
 */
export type CaseDetail = Case & {
  id: string
  title: string
  reference: string | null
  customer: string | null
  isDemo: boolean
  version: number
}

/**
 * The whole case document - every collection in one read.
 *
 * **`enabled` is not an optimisation here; it is what makes `useCaseSummary`
 * worth anything.** The shell mounts `HeaderSearch` and `ChordLayer` on every
 * case screen, and both read the document - so adding the summary beside them
 * *raises* what a case screen costs until each one waits for the thing it is
 * for: a query typed, a palette opened. Anything mounted always and reading
 * this owes the same gate.
 */
export function useCase(caseId: string, enabled = true): UseQueryResult<CaseDetail> {
  return useQuery({
    queryKey: keys.case(caseId),
    queryFn: () => request<CaseDetail>(`/cases/${encodeURIComponent(caseId)}`),
    enabled,
  })
}

/**
 * What the rail draws, without the rows it draws them from.
 *
 * **`CaseCollection`, not `CollectionName`.** They are two different wire
 * vocabularies and the difference is silent: `CollectionName` is snake_case
 * because it names a *route* (`/cases/:id/cloud_apps`), while the document and
 * this summary key their collections camelCase (`cloudApps`). Typing this
 * against the route names would have made every count for the three
 * multi-word collections `undefined` and drawn a chip reading 0.
 *
 * **`attention` is sparse.** A present key is a chip, so the server sends
 * nothing rather than a zero -
 * `attention.timeline === undefined` and `=== 0` would draw differently.
 *
 * `reports` is three columns, not the row: `document` and `frozen` would put
 * more bytes on this route than the document it exists to replace.
 */
export interface CaseRailSummary {
  id: string
  title: string
  reference: string | null
  customer: string | null
  isDemo: boolean
  version: number
  counts: Record<CaseCollection, number>
  attention: Partial<Record<CaseCollection, number>>
  reports: { id: string; label: string; sentAt: string | null }[]
}

/**
 * The rail's read, and the one every case screen makes.
 *
 * **This is what `CaseShell` reads instead of the whole document**, and it is
 * far fewer bytes at the same latency - so the argument is bytes on a metered
 * egress, the same unit compression is enabled for.
 *
 * **`useCase` survives for search, indicators and the graphs**, which are
 * case-wide by nature and genuinely want every row.
 */
export function useCaseSummary(caseId: string): UseQueryResult<CaseRailSummary> {
  return useQuery({
    queryKey: keys.summary(caseId),
    queryFn: () => request<CaseRailSummary>(`/cases/${encodeURIComponent(caseId)}/summary`),
  })
}

/**
 * One table, read on its own.
 *
 * Not a slice of `useCase`. A screen holding the whole case to render one
 * table is what makes the client the owner of the document - the thing
 * per-row writes exist to avoid. Same rows either way: the collection route
 * and the document project the same select.
 */
export function useCollection<N extends CollectionName>(
  caseId: string,
  collection: N,
): UseQueryResult<CollectionEntry[N][]> {
  return useQuery({
    queryKey: keys.collection(caseId, collection),
    queryFn: () =>
      request<CollectionEntry[N][]>(
        `/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}`,
      ),
  })
}

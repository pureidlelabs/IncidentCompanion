/**
 * `GET /api/cases/{id}/{collection}.csv` - one table, exported.
 *
 * A plain link, never `fetch` + blob: a same-origin top-level navigation
 * carries the session cookie with no code, and the `download` attribute is
 * what names the file - the route sets `content-type` and no
 * `content-disposition`.
 *
 * The `.csv` suffix is part of the path segment, not a query parameter: the
 * route is mounted as `{collection}.csv`, and the `?format=` form belongs to
 * `/indicators` alone.
 */

import { API_BASE } from './client'
import type { CollectionName } from './model'

export function collectionCsvHref(caseId: string, collection: CollectionName): string {
  return `${API_BASE}/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}.csv`
}

export function collectionCsvName(caseId: string, collection: CollectionName): string {
  return `${caseId}-${collection}.csv`
}

/**
 * `GET /api/cases/{id}/{collection}.csv` - one table, exported.
 *
 * A plain link, never `fetch` + blob: the route sets `Content-Disposition`
 * (unlike `/indicators`, which is why `IndicatorsSection` supplies its own
 * filename) and a same-origin top-level navigation carries the session cookie
 * with no code. The `download` attribute names the file either way.
 *
 * The `.csv` suffix is part of the path segment, not a query parameter - the
 * route is mounted as `{collection}.csv` and a `?format=` variant of it does
 * not exist. Encoded whole, because a path parameter matches a
 * segment: encoding `collection` separately would leave the dot to be read as
 * part of a table named `systems.csv`.
 */

import { API_BASE } from './client'
import type { CollectionName } from './model'

export function collectionCsvHref(caseId: string, collection: CollectionName): string {
  return `${API_BASE}/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}.csv`
}

export function collectionCsvName(caseId: string, collection: CollectionName): string {
  return `${caseId}-${collection}.csv`
}

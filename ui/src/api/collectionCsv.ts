/**
 * `GET /api/cases/{id}/{collection}.csv` - one table, exported.
 */

import { API_BASE } from './client'
import type { CollectionName } from './model'

export function collectionCsvHref(caseId: string, collection: CollectionName): string {
  return `${API_BASE}/cases/${encodeURIComponent(caseId)}/${encodeURIComponent(collection)}.csv`
}

export function collectionCsvName(caseId: string, collection: CollectionName): string {
  return `${caseId}-${collection}.csv`
}

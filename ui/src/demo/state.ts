/**
 * The demo's whole world: one case document, held in memory.
 *
 * `GET /api/cases/{id}` already answers a case with every collection on it, so
 * the document the server sends is the store the demo writes into and nothing
 * has to be assembled from parts.
 */
import campaign from '@/fixtures/campaign.json'

import type { Case } from '@/api/model'

export interface DemoState {
  kase: Case
}

/**
 * A store nothing has written to yet.
 *
 * Cloned, because the seed is a module-level JSON import shared by every caller
 * and a handler that mutated it would leave the next reset holding the edits.
 */
export function freshState(): DemoState {
  return { kase: structuredClone(campaign) as unknown as Case }
}

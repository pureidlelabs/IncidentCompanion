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
 *
 * **Not a demo case, here.** The seed carries `isDemo`, and the picker's
 * default pane hides such a case, so a visitor opening the case list found an
 * install with no cases. In this browser the case is the visitor's own: their
 * writes are kept, and only they can reset it.
 */
export function freshState(): DemoState {
  const kase = structuredClone(campaign) as unknown as Case
  return { kase: { ...kase, isDemo: false } }
}

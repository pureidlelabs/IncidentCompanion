/**
 * The demo's whole world: one case document, held in memory.
 */
import campaign from '@/fixtures/campaign.json'

import type { Case } from '@/api/model'

export interface DemoState {
  kase: Case
}

/**
 * A store nothing has written to yet.
 */
export function freshState(): DemoState {
  return { kase: structuredClone(campaign) as unknown as Case }
}

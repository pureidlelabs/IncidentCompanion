/**
 * A real case with nothing written into it, for the empty states.
 *
 * **The captured document is kept and its collections emptied**, so an empty
 * story is a case nobody has written to rather than a document with no fields.
 * That is also why these live here: reading the capture for its scalar fields
 * pulls the whole 291KB document in, and these are drawn by stories alone.
 * -> `fixtures-stay-out-of-the-bundle.rule.test.ts`
 */
import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

/**
 * The campaign demo with every collection these screens draw emptied.
 *
 * The case document itself is kept, so an empty story is a real case nobody
 * has written to yet rather than a document with no fields.
 */
export const EMPTY_CAMPAIGN: Case = {
  ...campaignCase,
  timeline: [],
  impact: [],
  casenotes: [],
  systems: [],
  accounts: [],
  networkIndicators: [],
  malware: [],
  cloudApps: [],
  evidence: [],
  actions: [],
  reports: [],
  reportBlocks: [],
}

/**
 * The campaign demo with every collection a screen in this tier draws emptied.
 *
 * The case itself is kept, so an empty story is a real case with nothing in it
 * rather than a document with no fields.
 */
export const EMPTY_CASE: Case = {
  ...campaignCase,
  systems: [],
  accounts: [],
  networkIndicators: [],
  malware: [],
  cloudApps: [],
  evidence: [],
  actions: [],
}

/**
 * A real case with nothing written into it, for the empty states.
 *
 * **The captured document is kept and its collections emptied**, so an empty
 * story is a case nobody has written to rather than a document with no fields.
 * That is also why these live here rather than beside the screens: reading the
 * capture for its scalar fields brings the whole document with it.
 * -> `fixtures-stay-out-of-the-bundle.rule.test.ts`
 */
import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

/** Every collection the entity screens draw, emptied. */
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

/**
 * The same, and the five collections the timeline and report screens draw.
 *
 * Built from `EMPTY_CASE` because its seven are a subset of these twelve, and
 * two hand-written lists drift.
 */
export const EMPTY_CAMPAIGN: Case = {
  ...EMPTY_CASE,
  timeline: [],
  impact: [],
  casenotes: [],
  reports: [],
  reportBlocks: [],
}

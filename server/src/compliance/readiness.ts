/**
 * What each live regime still needs before its report can be filed.
 */
import { DORA_ROOT_CAUSE_ADDITIONAL } from '../domain/vocabularies/compliance.js'
import * as dora from './dora.js'
import * as gdpr from './gdpr.js'
import * as nis2 from './nis2.js'
import type { Policy } from '../domain/compliance-policy.js'
import type { ComplianceRow } from './compliance.service.js'

/** Regime key to the label a screen shows. A closed set: a regime is law. */
export const REGIMES: Record<string, string> = {
  nis2: 'NIS2 (Article 23)',
  gdpr: 'GDPR (Articles 33 and 34)',
  dora: 'DORA (Articles 17 to 20)',
}

export interface Readiness {
  regime: string
  label: string
  gaps: string[]
  tracked: number
  /** Fields the regime asks for that this app has no home for at all. */
  untracked: number
  ready: boolean
  /** The one-line form the Compliance block shows. */
  line: string
}

/**
 * **Never a bare "Ready to file".** The app decides what it can see, and an
 * unqualified claim about a regulatory filing is one it cannot make.
 */
function summarise(
  regime: string,
  gaps: string[],
  tracked: number,
  untracked = 0,
): Readiness {
  const head = gaps.length
    ? `${gaps.length} of ${tracked} facts still unstated`
    : `all ${tracked} facts stated`
  const line = untracked
    ? `${head}; ${untracked} more Annex II fields are filed outside this app`
    : head
  return { regime, label: REGIMES[regime]!, gaps, tracked, untracked, ready: gaps.length === 0, line }
}

/**
 * NIS2's gaps: the scope facts, then whatever the entity's own article asks
 * that this case stores no field for.
 */
function nis2Readiness(row: ComplianceRow): Readiness {
  const gaps: string[] = []
  if (!row.nis2EntityClass) gaps.push('NIS2 classification of the customer')
  if (!row.nis2EntityType) gaps.push('entity type (it picks the significance track)')
  if (!row.homeMemberState) gaps.push('reporting Member State')
  if (nis2.significance(row).met === null) {
    gaps.push('enough grounds to reach a significance verdict')
  }
  gaps.push(...nis2.unassessedLimbs(row))
  return summarise('nis2', gaps, 4)
}

/**
 * GDPR's gaps: the two scoring factors, awareness, and the notifications each
 * determination says are owed.
 */
function gdprReadiness(row: ComplianceRow, policy: Policy): Readiness {
  const gaps: string[] = []
  if (!row.gdprDataContext) gaps.push('data category (ENISA DPC)')
  if (!row.gdprIdentifiability) gaps.push('how identifiable the data is (ENISA EI)')
  if (!row.gdprAwareAt) gaps.push('when the controller became aware (starts the 72 hours)')

  const done = gdpr.notified(row)
  if (gdpr.article33(row, policy).met === true && !done.authority) {
    gaps.push('supervisory authority not yet recorded as notified')
  }
  if (gdpr.article34(row, policy).met === true && !done.subjects) {
    gaps.push('data subjects not yet recorded as informed')
  }
  return summarise('gdpr', gaps, 5)
}

/**
 * The Annex II fields this app has a home for, by their ITS number.
 */
const TRACKED_ITS_FIELDS: [string, keyof ComplianceRow, string][] = [
  ['3.25', 'doraThreatTechniques', 'Threats and techniques used by the threat actor'],
  ['4.1', 'doraRootCauseHigh', 'High-level classification of root causes of the incident'],
  ['4.2', 'doraRootCauseDetailed', 'Detailed classification of root causes of the incident'],
  ['4.3', 'doraRootCauseAdditional', 'Additional classification of root causes of the incident'],
]

const ANNEX_II_FIELDS = 76

/**
 * Whether any chosen 4.2 cause has a further level at all.
 */
function needsAdditional(detailed: readonly string[]): boolean {
  return detailed.some((one) => one in DORA_ROOT_CAUSE_ADDITIONAL)
}

/**
 * DORA's gaps: the Article 6 gate and the tracked Annex II fields left empty.
 */
function doraReadiness(row: ComplianceRow): Readiness {
  const gaps: string[] = []
  if (dora.inScope(row).met === null) {
    gaps.push('whether critical services were affected (Article 6)')
  }
  for (const [number, column, title] of TRACKED_ITS_FIELDS) {
    const value = row[column]
    const empty = Array.isArray(value) ? value.length === 0 : !value
    if (!empty) continue
    if (number === '4.3' && !needsAdditional(row.doraRootCauseDetailed ?? [])) continue
    gaps.push(`${number} ${title}`)
  }
  // The four Annex II fields plus the Article 6 gate, which is an RTS
  // criterion and not an Annex II field - so `untracked` is not a subtraction
  // from `tracked`.
  return summarise('dora', gaps, TRACKED_ITS_FIELDS.length + 1, ANNEX_II_FIELDS - TRACKED_ITS_FIELDS.length)
}

/**
 * One line per regime that is switched on **and in play**.
 */
export function readiness(
  row: ComplianceRow,
  enabled: Record<string, boolean>,
  policy: Policy,
): Readiness[] {
  const out: Readiness[] = []
  if (enabled.nis2 && (row.nis2EntityClass === 'essential' || row.nis2EntityClass === 'important')) {
    out.push(nis2Readiness(row))
  }
  if (enabled.gdpr && row.personalDataInvolved === 'yes') out.push(gdprReadiness(row, policy))
  if (enabled.dora) out.push(doraReadiness(row))
  return out
}

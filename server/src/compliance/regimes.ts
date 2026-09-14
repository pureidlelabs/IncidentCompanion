/**
 * Which regimes exist, and whether a case is in play for each.
 *
 * **One list, because two lists disagree.** Whether a regime is in play decided
 * what the verdict showed and what the readiness line showed, and the two were
 * written separately: the DORA pair had already parted, so a case with DORA
 * switched on and its criticality gate unanswered was told it was short of
 * facts for a regime it showed no verdict under.
 *
 * In play means classified in scope rather than merely not excluded, so a fresh
 * case is in play for nothing. Switched on is the operator's separate answer and
 * is asked here rather than by each caller, because a caller that asks only one
 * of the two questions is the defect this module exists to end.
 */
import * as dora from './dora.js'
import type { ComplianceRow } from './compliance.service.js'

export interface Regime {
  /** What the switch, the readiness line and the policy all key on. */
  key: string
  /** How a verdict names it. */
  label: string
  /** Whether this case is in play, given the regime is switched on. */
  inPlay: (row: ComplianceRow) => boolean
}

/** The order a case shows them in. */
export const REGIMES: readonly Regime[] = [
  {
    key: 'nis2',
    label: 'NIS2',
    inPlay: (row) => row.nis2EntityClass === 'essential' || row.nis2EntityClass === 'important',
  },
  {
    key: 'gdpr',
    label: 'GDPR',
    inPlay: (row) => row.personalDataInvolved === 'yes',
  },
  {
    key: 'dora',
    /**
     * **Once the criticality gate has any answer at all.** Before that the row
     * reads `undetermined` on every case the app opens, which is a verdict
     * about nothing and a readiness line against nothing.
     */
    label: 'DORA',
    inPlay: (row) => dora.inScope(row).met !== null,
  },
]

/**
 * The regimes this case is both switched on for and in play for.
 *
 * Every consumer filters through this rather than repeating either half, which
 * is what holds a readiness line and a verdict row to the same set.
 */
export function regimesInPlay(
  row: ComplianceRow,
  enabled: Record<string, boolean>,
): readonly Regime[] {
  return REGIMES.filter((one) => enabled[one.key] === true && one.inPlay(row))
}

/**
 * Which regimes exist, what they are called, and whether a case is in play for
 * each.
 *
 * **One list, because the conditions were written out per caller.** Whether a
 * regime is in play gates both the verdict rows and the readiness lines, and
 * each dispatcher carried its own copy: the NIS2 predicate appeared three
 * times, and the DORA pair had parted, the verdict waiting for the Article 6
 * gate to have an answer where the readiness line did not. Both now filter the
 * same set, so they cannot part again.
 *
 * In play means classified in scope rather than merely not excluded, so a fresh
 * case is in play for nothing. Switched on is the operator's separate answer and
 * is asked here rather than by each caller, because a caller that asks only one
 * of the two questions is what this module exists to prevent.
 */
import * as dora from './dora.js'
import type { ComplianceRow } from './compliance.service.js'
import { REGIME_LABEL, type RegimeKey } from '../domain/vocabularies/regimes.js'

/**
 * **A closed set, because a regime is law.** Typing the key rather than taking
 * `string` is what makes a table keyed on it exhaustive: a regime added to the
 * vocabulary and nowhere else fails to compile rather than answering a request
 * with a `TypeError`.
 */
export type { RegimeKey }

export interface Regime {
  /** What the switch and the readiness line key on. */
  key: RegimeKey
  /** How a verdict names it. */
  label: string
  /** How a readiness line names it, which cites the articles it is short of. */
  reading: string
  /** Whether this case is in play, given the regime is switched on. */
  inPlay: (row: ComplianceRow) => boolean
}

/** The order a case shows them in. */
export const REGIMES: readonly Regime[] = [
  {
    key: 'nis2',
    label: REGIME_LABEL.nis2,
    reading: 'NIS2 (Article 23)',
    inPlay: (row) => row.nis2EntityClass === 'essential' || row.nis2EntityClass === 'important',
  },
  {
    key: 'gdpr',
    label: REGIME_LABEL.gdpr,
    reading: 'GDPR (Articles 33 and 34)',
    inPlay: (row) => row.personalDataInvolved === 'yes',
  },
  {
    key: 'dora',
    /**
     * **Once the criticality gate has any answer at all.** Before that the row
     * reads `undetermined` on every case the app opens, which is a verdict
     * about nothing and a readiness line against nothing.
     */
    label: REGIME_LABEL.dora,
    reading: 'DORA (Articles 17 to 20)',
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

/**
 * **A regime showing no verdict shows no readiness line, and the reverse.**
 *
 * `readiness` states this as its contract: *keyed on the same conditions the
 * verdict rows are, so a regime showing no verdict shows no readiness line
 * either*. It was two lists of conditions rather than one, and they had
 * diverged on DORA -- the verdict waits for the Article 6 gate to have any
 * answer, the readiness line did not, so a case with DORA switched on and
 * nothing recorded was told it was short of facts for a regime it showed no
 * verdict under. -> #647
 *
 * **Asserted as a property over rows rather than on one case**, because the
 * failure is a disagreement between two dispatchers and any row where they
 * differ is a counterexample. The rows below are chosen to sit either side of
 * each regime's own gate.
 *
 * **What this does not cover:** whether either answer is right for the case -
 * that a NIS2 verdict says what the Directive says is `lenses.test.ts`. This
 * says only that the two lists agree.
 */
import { describe, expect, it } from 'vitest'

import type { ComplianceRow } from './compliance.service.js'
import type { Policy } from '../domain/compliance-policy.js'
import { readiness } from './readiness.js'
import { complianceBreakdown } from './verdict.js'

const POLICY: Policy = {
  gdprRiskBand: null,
  gdprHighRiskBand: null,
} as unknown as Policy

/** Every field null or empty, which is the case an analyst has just opened. */
function record(over: Partial<ComplianceRow> = {}): ComplianceRow {
  return {
    caseId: '00000000-0000-0000-0000-000000000000',
    nis2EntityClass: null,
    personalDataInvolved: null,
    affectedMemberStates: [],
    outsideEuCountries: '',
    competentAuthority: '',
    usersAffected: '',
    financialImpact: '',
    ...over,
  } as unknown as ComplianceRow
}

const ALL_ON = { nis2: true, gdpr: true, dora: true }

/**
 * Rows either side of each regime's own gate, named by what makes them
 * interesting rather than by a number.
 */
const ROWS: [string, ComplianceRow][] = [
  ['a case just opened, nothing recorded', record()],
  ['an essential NIS2 entity', record({ nis2EntityClass: 'essential' })],
  ['an important NIS2 entity', record({ nis2EntityClass: 'important' })],
  ['an entity out of NIS2 scope', record({ nis2EntityClass: 'out-of-scope' } as Partial<ComplianceRow>)],
  ['personal data involved', record({ personalDataInvolved: 'yes' })],
  ['personal data ruled out', record({ personalDataInvolved: 'no' })],
  [
    'everything answered at once',
    record({ nis2EntityClass: 'essential', personalDataInvolved: 'yes' }),
  ],
]

describe('the regimes a case is in play for', () => {
  it.each(ROWS)('agrees between verdict and readiness for %s', (_what, row) => {
    const withVerdicts = new Set(
      complianceBreakdown(row, ALL_ON, POLICY).map((one) => one.regime.toLowerCase()),
    )
    const withLines = new Set(readiness(row, ALL_ON, POLICY).map((one) => one.regime.toLowerCase()))

    expect(
      [...withLines].sort(),
      'a regime is told it is short of facts while showing no verdict for that row to attach to',
    ).toEqual([...withVerdicts].sort())
  })

  /** A regime switched off is in play for neither, whatever the row says. */
  it.each(ROWS)('offers nothing for a regime switched off, for %s', (_what, row) => {
    const off = { nis2: false, gdpr: false, dora: false }

    expect(complianceBreakdown(row, off, POLICY)).toEqual([])
    expect(readiness(row, off, POLICY)).toEqual([])
  })
})

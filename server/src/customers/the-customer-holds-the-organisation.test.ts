/**
 * **What a customer holds is the organisation's facts and none of the
 * incident's**, which `openspec/specs/customers/spec.md` states as a list on
 * each side:
 */
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { ORGANISATION_FACTS } from './organisation-facts.js'
import { customers } from '../db/schema/customer.js'
import { caseCompliance } from '../db/schema/case-compliance.js'
import { rowVersioning } from '../db/schema/columns.js'

/**
 * The nine facts the specification names, against the columns that carry them.
 */
const THE_SPECIFICATION_NAMES: Record<string, readonly string[]> = {
  'which regulatory regimes apply to it at all': ['regimes'],
  'its home member state': ['homeMemberState'],
  'whether it operates beyond the EU and where': ['outsideEuReach', 'outsideEuCountries'],
  'its competent authority': ['competentAuthority'],
  "its data protection officer's contact": ['dpoContact'],
  'the size of its user base': ['usersTotalCount'],
  'its annual turnover': ['annualTurnoverEur'],
  'its critical functions': ['doraCriticalFunctions'],
  'the services it provides that are supervised': ['doraSupervisedServices'],
}

/**
 * What the specification says belongs to the case instead.
 */
const THE_CASE_S_OWN: readonly string[] = [
  'personalDataInvolved',
  'usersAffected',
  'usersAffectedCount',
  'serviceDowntimeMinutes',
  'serviceDowntimeComplete',
  'financialImpact',
  'financialLossEur',
  'unlawfulOrMalicious',
  'gdprAwareAt',
  'gdprAuthorityNotifiedAt',
  'gdprSubjectsNotifiedAt',
]

/**
 * The row's identity, its write record, its name and the default flag -- none
 * of which answers anything about the organisation.
 */
const BOOKKEEPING = new Set([
  'id',
  'name',
  'isDefault',
  ...Object.keys(rowVersioning),
])

describe('what a customer holds', () => {
  const held = Object.keys(getTableColumns(customers)).filter((name) => !BOOKKEEPING.has(name))
  const named = Object.values(THE_SPECIFICATION_NAMES).flat()

  it('holds a column for every fact the specification names, and no other', () => {
    expect([...held].sort()).toEqual([...named].sort())
  })

  /**
   * **The direction that matters.**
   */
  it.each(THE_CASE_S_OWN)("does not hold the case's own fact %s", (name) => {
    expect(held).not.toContain(name)
  })

  /** The premise of the case above: these are real columns somewhere. */
  it('names case facts that the case actually holds', () => {
    const onTheCase = Object.keys(getTableColumns(caseCompliance))
    const missing = THE_CASE_S_OWN.filter((name) => !onTheCase.includes(name))
    expect(missing, 'this list has drifted from the case compliance schema').toEqual([])
  })

  /**
   * **`regimes` is the one organisation fact a case does not copy**, and the
   * reason is in `organisation-facts.ts`: it decides which questions a case is
   * asked rather than answering one, so copying it would freeze a case's
   * questionnaire at the moment somebody first opened its compliance screen.
   *
   * Asserted because the difference between the two sets is a decision, and a
   * decision nothing checks is one somebody will tidy away.
   */
  it('copies every organisation fact onto a case except the regimes', () => {
    expect([...ORGANISATION_FACTS].sort()).toEqual(
      named.filter((name) => name !== 'regimes').sort(),
    )
  })
})

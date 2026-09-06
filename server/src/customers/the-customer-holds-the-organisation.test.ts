/**
 * **What a customer holds is the organisation's facts and none of the
 * incident's**, which `openspec/specs/customers/spec.md` states as a list on
 * each side:
 *
 * > The organisation's facts are: which regulatory regimes apply to it at all,
 * > its home member state, whether it operates beyond the EU and where, its
 * > competent authority, its data protection officer's contact, the size of its
 * > user base, its annual turnover, its critical functions, and the services it
 * > provides that are supervised.
 *
 * > The incident's facts MUST NOT be held here. Whether personal data was
 * > involved, how many users this incident affected, how long service was down,
 * > what it cost, whether access was malicious, and every date on which
 * > somebody was notified belong to the case.
 *
 * **The subject list is the table, and the expectation is the specification.**
 * `ORGANISATION_FACTS` is derived -- a column added to `customers` becomes an
 * organisation fact by construction -- which is the right default and is
 * exactly why it needs a check outside itself. Asserting the derived set
 * against the schema it was derived from tests nothing; asserting it against
 * the sentence somebody wrote in the specification is the only independent
 * oracle available.
 *
 * So the map below is deliberately hand-written. It is the bridge between the
 * specification's words and the code's names, and `rules/claim-homes.md` puts
 * an externally visible name in the specification for this reason: these are
 * API fields, and the analyst filling them in reads both.
 */
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { ORGANISATION_FACTS } from './organisation-facts.js'
import { customers } from '../db/schema/customer.js'
import { caseCompliance } from '../db/schema/case-compliance.js'
import { rowVersioning } from '../db/schema/columns.js'

/**
 * The nine facts the specification names, against the columns that carry them.
 *
 * **Nine facts, ten columns.** *"whether it operates beyond the EU and where"*
 * is one fact answered by two columns, which is why this is a map to lists
 * rather than a list of pairs.
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
 *
 * Named as the columns that carry them on `case_compliance`, so the assertion
 * is that none of these is *also* a customer column. Written out because the
 * refusal is the point: a derived list of "everything not an organisation
 * fact" would be satisfied by any partition, including the wrong one.
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
 *
 * **Derived from `rowVersioning` rather than written out**, which is the one
 * list here that must not be hand-held: it is internal, it grows, and a first
 * draft of this file spelled it by hand and missed `createdBy` and `updatedBy`.
 * The lists above are hand-written on purpose because they bridge to the
 * specification; this one bridges to nothing and would only drift.
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
   * **The direction that matters.** A customer column carrying an incident's
   * fact would answer it once for the organisation and for every case it ever
   * has -- which is wrong for *"how many users this incident affected"* in a
   * way no analyst would notice until two incidents disagreed.
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
   * Asserted because the difference between the two sets is a decision --
   * `organisation-facts.ts` says which and why -- and a decision nothing
   * checks is one somebody will tidy away.
   */
  it('copies every organisation fact onto a case except the regimes', () => {
    expect([...ORGANISATION_FACTS].sort()).toEqual(
      named.filter((name) => name !== 'regimes').sort(),
    )
  })
})

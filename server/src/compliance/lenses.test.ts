/**
 * The three lenses, attacked at the places the law is easy to get subtly wrong.
 *
 * **Every case here is a way to be confidently wrong**: a threshold met at
 * exactly the published number, a carve-out counted as a reason to notify, an
 * unanswered ground read as a no. Each returns a clean verdict with a
 * plausible breakdown under it.
 *
 * **What this cannot check is whether the numbers are the Regulation's** - a
 * test asserting the constants against themselves passes on a fabricated limb.
 * That is what lifting the figures rather than retyping them is for.
 */
import { describe, expect, it } from 'vitest'

import * as dora from './dora.js'
import * as enisa from './enisa.js'
import * as gdpr from './gdpr.js'
import * as nis2 from './nis2.js'
import { atLeast, criterion, threshold } from './gates.js'
import type { Criterion, Determination } from './gates.js'
import type { ComplianceRow } from './compliance.service.js'

/** A record with everything unanswered, which is what a fresh case is. */
function record(over: Partial<ComplianceRow> = {}): ComplianceRow {
  return {
    caseId: '00000000-0000-0000-0000-000000000000',
    nis2EntityClass: null,
    nis2EntityType: null,
    nis2Significance: null,
    nis2SevereDisruption: null,
    nis2ConsiderableDamage: null,
    nis2TradeSecretLoss: null,
    nis2Death: null,
    nis2HealthDamage: null,
    nis2MaliciousAccess: null,
    homeMemberState: null,
    affectedMemberStates: [],
    outsideEuReach: false,
    outsideEuCountries: '',
    competentAuthority: '',
    unlawfulOrMalicious: null,
    personalDataInvolved: null,
    usersAffected: '',
    usersAffectedCount: null,
    usersTotalCount: null,
    serviceDowntimeMinutes: null,
    serviceDowntimeComplete: false,
    financialImpact: '',
    financialLossEur: null,
    annualTurnoverEur: null,
    recurringIncident: null,
    recurringEarlierCases: '',
    gdprDataContext: null,
    gdprIdentifiability: null,
    gdprCircumstances: [],
    gdprSeverityOverride: null,
    gdprAwareAt: null,
    gdprAuthorityNotifiedAt: null,
    gdprSubjectsNotifiedAt: null,
    gdprEncryptionApplied: null,
    gdprSubsequentMeasures: null,
    gdprPublicCommunication: null,
    dpoContact: '',
    doraThreatTechniques: [],
    doraRootCauseHigh: null,
    doraRootCauseDetailed: [],
    doraRootCauseAdditional: [],
    doraCriticalFunctions: null,
    doraSupervisedServices: null,
    doraMaliciousAccess: null,
    doraRelevantClients: null,
    doraReputationalImpact: null,
    doraDataAdverseImpact: null,
    doraDurationMinutes: null,
    doraCostsEur: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...over,
  } as ComplianceRow
}

/**
 * One named limb of a determination.
 *
 * **Typed against `Determination`, not a structural stand-in.** A looser
 * `{ criteria: { key: string }[] }` types every `.met` and `.detail` below as
 * an error `tsc` reports and `vitest` never runs, so the suite stays green
 * over assertions that do not compile.
 */
const limb = (determination: Pick<Determination, 'criteria'>, key: string): Criterion | undefined =>
  determination.criteria.find((one) => one.key === key)

describe('the gates', () => {
  it('keeps an unanswered criterion from reading as a no', () => {
    const some = atLeast(2, [
      criterion('a', 'A', true),
      criterion('b', 'B', null),
      criterion('c', 'C', false),
    ])
    // One met, one still possible: two is still reachable, so this is a
    // question rather than a finding.
    expect(some.met).toBeNull()
  })

  it('settles at-least in the negative once too few can still be met', () => {
    // Not "waiting for data" forever: one met and one unknown cannot reach
    // three, and reporting undetermined would leave a case open on a bar it
    // can no longer clear.
    expect(atLeast(3, [criterion('a', 'A', true), criterion('b', 'B', null)]).met).toBe(false)
  })

  it('does not meet a threshold at exactly the published number', () => {
    // **Every significance threshold in the Implementing Regulation is
    // strictly greater.** Measured over the vendored OJ text at
    // `tests/data/nis2-ir-2024-2690-articles.json`: 49 occurrences of "more
    // than", one "exceeds" (Art 3(1)(a)'s EUR 500 000), and zero of "equal to
    // or". Its seven "at least" clauses are the security-measures annex
    // ("reviewed at least annually", "at least partial redundancy") and Art
    // 4's recurrence count - not one of them is a limb this function computes.
    //
    // `>=` files an incident the Regulation does not, at every published
    // figure: exactly EUR 500 000, exactly 30 minutes, exactly 20 minutes.
    expect(threshold('l', 'Loss', 500_000, 500_000).met).toBe(false)
    expect(threshold('l', 'Loss', 500_001, 500_000).met).toBe(true)
    expect(threshold('d', 'Downtime', 30, 30).met).toBe(false)
    expect(threshold('d', 'Downtime', 31, 30).met).toBe(true)
  })

  it('reads a stated zero as a measurement, where Python read it as silence', () => {
    // The columns are nullable here. A downtime of zero minutes is an incident
    // caught before it bit, and answering the limb with it is correct.
    expect(threshold('d', 'Downtime', 0, 30).met).toBe(false)
    expect(threshold('d', 'Downtime', null, 30).met).toBeNull()
  })
})

describe('the ENISA severity score', () => {
  it('puts exactly 2.0 in medium, not low', () => {
    // ENISA's bands are `2 <= SE < 3`. An exclusive-at-the-bottom reading moves
    // every boundary case down one band, and down is the cheap direction.
    expect(enisa.severityBand(2.0)).toBe('medium')
    expect(enisa.severityBand(1.999)).toBe('low')
  })

  it('compares bands by rung and not by name', () => {
    // Alphabetically: high < low < medium < very high - exactly wrong, and
    // silently so.
    expect(enisa.atLeastBand('high', 'medium')).toBe(true)
    expect(enisa.atLeastBand('low', 'medium')).toBe(false)
  })

  it('counts a circumstance named twice once', () => {
    const twice = enisa.severityScore('financial', 'limited', ['malicious', 'malicious'])
    const once = enisa.severityScore('financial', 'limited', ['malicious'])
    expect(twice.score).toBe(once.score)
  })

  it('refuses to score an unstated factor rather than assuming one', () => {
    // A default of "simple" returns a confident low band for a breach nobody
    // has assessed - the one output worse than no score.
    expect(enisa.scoreable(null, 'limited')).toBe(false)
    expect(() => enisa.severityScore('', 'limited')).toThrow()
  })
})

describe('NIS2 Article 23', () => {
  it('leaves an unclassified entity undetermined rather than out of scope', () => {
    expect(nis2.inScope(record()).met).toBeNull()
    expect(nis2.significance(record()).met).toBeNull()
  })

  it('picks the quantified track only for the types the IR names', () => {
    expect(track('cloud')).toBe('quantified')
    expect(track('other')).toBe('qualitative')
    expect(nis2.track(record())).toBe('')
  })

  it('does not answer a covered entity on the qualitative grounds', () => {
    // Recital 30 makes the IR's criteria exhaustive. A cloud provider that
    // ticked Article 23(3)(a) is *not* significant on that ground alone.
    const row = record({
      nis2EntityClass: 'essential',
      nis2EntityType: 'cloud',
      nis2SevereDisruption: 'yes',
    })
    expect(nis2.significance(row).met).not.toBe(true)
    expect(limb(nis2.significance(row), 'severe_disruption')).toBeUndefined()
  })

  it('holds a degraded service clear of the complete-outage limb', () => {
    // Measured against the complete-outage limit, a degradation crosses it in
    // half the time - which is why the case records which kind it was.
    const row = record({
      nis2EntityClass: 'essential',
      nis2EntityType: 'cloud',
      serviceDowntimeMinutes: 600,
      serviceDowntimeComplete: false,
    })
    expect(limb(nis2.quantifiedCriteria(row), 'complete_outage')!.met).toBe(false)
  })

  it('lowers the loss limit to 5% of turnover when that is the lower figure', () => {
    // The percentage is the half that makes a smaller entity's threshold
    // smaller; dropping it reports them clear of a limit they are over.
    const row = record({
      nis2EntityClass: 'important',
      nis2EntityType: 'other',
      annualTurnoverEur: 2_000_000, // 5% = 100 000
      financialLossEur: 150_000,
    })
    const loss = limb(nis2.quantifiedCriteria({ ...row, nis2EntityType: 'cloud' }), 'financial_loss')!
    expect(loss.met).toBe(true)
    expect(loss.detail).toContain('5% of turnover')
  })

  it('says the 5% limb was not tested when no turnover is stated', () => {
    const row = record({ nis2EntityType: 'cloud', financialLossEur: 10 })
    expect(limb(nis2.quantifiedCriteria(row), 'financial_loss')!.detail).toContain(
      'turnover not stated',
    )
  })

  it('gives a trust service no duration limb on limited availability', () => {
    // Art 14(c) sets a user-reach test; the calendar-week duration in 14(b) is
    // a separate criterion. Holding a trust service to a duration 14(c) never
    // sets under-reports, exactly as inventing a limb an article omits
    // over-reports.
    const row = record({ nis2EntityType: 'trust', serviceDowntimeMinutes: 5000 })
    const detail = limb(nis2.quantifiedCriteria(row), 'limited_availability')!.detail
    expect(detail).not.toContain('minutes')
  })

  it('gives DNS no limited-availability criterion at all', () => {
    const row = record({ nis2EntityType: 'dns', serviceDowntimeMinutes: 5000 })
    expect(limb(nis2.quantifiedCriteria(row), 'limited_availability')).toBeUndefined()
  })

  it('names the limbs the case stores no field for', () => {
    expect(nis2.unassessedLimbs(record({ nis2EntityType: 'dns' })).length).toBeGreaterThan(0)
    expect(nis2.unassessedLimbs(record({ nis2EntityType: 'other' }))).toEqual([])
  })

  function track(kind: string) {
    return nis2.track(record({ nis2EntityType: kind }))
  }
})

describe('GDPR Articles 33 and 34', () => {
  const breach = (over: Partial<ComplianceRow> = {}) =>
    record({
      personalDataInvolved: 'yes',
      gdprDataContext: 'sensitive',
      gdprIdentifiability: 'maximum',
      gdprCircumstances: ['confidentiality', 'malicious'],
      ...over,
    })

  it('leaves both obligations undetermined while the breach is unassessed', () => {
    const row = record({ personalDataInvolved: 'yes' })
    expect(gdpr.article33(row).met).toBeNull()
    expect(gdpr.article34(row).met).toBeNull()
  })

  it('answers the two articles separately rather than once', () => {
    // Financial data, straightforwardly identifiable, nothing aggravating:
    // SE = 3.0 x 0.75 = 2.25, a risk worth notifying the authority about and
    // not the high risk Article 34 turns on.
    const row = breach({
      gdprDataContext: 'financial',
      gdprIdentifiability: 'significant',
      gdprCircumstances: [],
    })
    expect(gdpr.effectiveBand(row)).toBe('medium')
    expect(gdpr.article33(row).met).toBe(true)
    expect(gdpr.article34(row).met).toBe(false)
  })

  it('lets a carve-out remove the duty rather than adding to it', () => {
    const high = breach()
    expect(gdpr.article34(high).met).toBe(true)
    expect(gdpr.article34(breach({ gdprEncryptionApplied: 'yes' })).met).toBe(false)
  })

  it('keeps the duty standing while no carve-out is claimed', () => {
    // 34(3) is an exception the controller invokes: silence means it is not
    // being relied on, so an unanswered carve-out is not a gap.
    expect(gdpr.article34(breach({ gdprEncryptionApplied: null })).met).toBe(true)
  })

  it('does not report a case clear on a band it cannot find', () => {
    // The band list is indexed; an unknown one lands at -1 and compares as
    // below every floor, which reports both obligations as not owed.
    const row = breach({ gdprSeverityOverride: 'catastrophic' })
    expect(gdpr.effectiveBand(row)).toBe('very high')
    expect(gdpr.article34(row).met).toBe(true)
  })

  it('lets a stated band beat the computed one, in both directions', () => {
    expect(gdpr.effectiveBand(breach({ gdprSeverityOverride: 'low' }))).toBe('low')
    expect(gdpr.article34(breach({ gdprSeverityOverride: 'low' })).met).toBe(false)
  })

  it('counts the 72 hours from awareness and goes negative once it passes', () => {
    const aware = new Date('2026-08-01T00:00:00Z')
    const row = breach({ gdprAwareAt: aware })
    expect(gdpr.deadline(row)!.toISOString()).toBe('2026-08-04T00:00:00.000Z')
    expect(gdpr.hoursRemaining(row, new Date('2026-08-05T00:00:00Z'))).toBe(-24)
  })

  it('leaves the deadline unknown rather than counting from detection', () => {
    expect(gdpr.deadline(breach())).toBeNull()
  })
})

describe('DORA Article 19', () => {
  const critical = (over: Partial<ComplianceRow> = {}) =>
    record({ doraCriticalFunctions: 'yes', ...over })

  it('does not meet a threshold at exactly the published number', () => {
    // The RTS says *higher than* and *exceeded*. `>=` files an incident the
    // Regulation does not.
    const at = critical({ doraCostsEur: 100_000 })
    const over = critical({ doraCostsEur: 100_001 })
    expect(limb(dora.major(at), 'costs')!.met).toBe(false)
    expect(limb(dora.major(over), 'costs')!.met).toBe(true)
  })

  it('makes 9(5)(b) sufficient on its own', () => {
    // The one asymmetry a plain "two of seven" erases, in the direction of
    // under-reporting.
    expect(dora.major(critical({ doraMaliciousAccess: 'yes' })).met).toBe(true)
  })

  /**
   * Every Article 9 threshold answered, and answered short.
   *
   * **`atLeast` settles negative only once too few limbs *can* still be met**,
   * so a fixture that leaves any of the six unstated gives `null` from
   * `others` and cannot see what these two tests are for. All six are
   * definite here; only 9(5)(b) is left to vary.
   */
  const allThresholdsShort = (over: Partial<ComplianceRow> = {}) =>
    critical({
      usersAffectedCount: 1,
      usersTotalCount: 1_000_000,
      doraRelevantClients: 'no',
      doraReputationalImpact: 'no',
      doraDurationMinutes: 1,
      serviceDowntimeMinutes: 1,
      affectedMemberStates: ['NL'],
      doraDataAdverseImpact: 'no',
      doraCostsEur: 1,
      ...over,
    })

  it('leaves the verdict open while 9(5)(b) is unanswered and the rest fall short', () => {
    // 9(5)(b) is sufficient on its own, so a definite no from the other six
    // settles only the half that was asked. Answering `false` files a major
    // incident as ordinary on a limb nobody put to the analyst - and because
    // `verdict.ts` renders the deciding criteria only, the unasked question is
    // then dropped from the breakdown rather than shown as outstanding.
    const unasked = allThresholdsShort()
    expect(dora.thresholds(unasked).every((one) => one.met === false)).toBe(true)
    expect(limb(dora.major(unasked), 'malicious_data_access')!.met).toBeNull()
    expect(dora.major(unasked).met).toBeNull()
  })

  it('answers no once 9(5)(b) is answered and the rest fall short', () => {
    // The other direction of the same clause: a stated no is a measurement,
    // and seven definite noes are a definite verdict rather than a permanent
    // question.
    expect(dora.major(allThresholdsShort({ doraMaliciousAccess: 'no' })).met).toBe(false)
  })

  it('counts Article 9(1) once however many of its limbs fire', () => {
    // Listing them flat would let one paragraph supply both thresholds on its
    // own and make almost every incident major.
    const row = critical({
      usersAffectedCount: 500_000,
      usersTotalCount: 1_000_000,
      doraRelevantClients: 'yes',
    })
    expect(dora.thresholds(row).filter((one) => one.met === true)).toHaveLength(1)
    expect(dora.major(row).met).not.toBe(true)
  })

  it('counts duration and downtime as one threshold', () => {
    const row = critical({ doraDurationMinutes: 3000, serviceDowntimeMinutes: 500 })
    expect(dora.thresholds(row).filter((one) => one.met === true)).toHaveLength(1)
  })

  it('is major on two distinct thresholds', () => {
    const row = critical({ doraDurationMinutes: 3000, doraCostsEur: 200_000 })
    expect(dora.major(row).met).toBe(true)
  })

  it('leaves the share undetermined when only the affected count is stated', () => {
    // Reading an unstated total as "all of them" reports 100 % of an unknown
    // base, which crosses 10 % every time.
    const row = critical({ usersAffectedCount: 5 })
    expect(limb(dora.thresholds(row).length ? { criteria: dora.thresholds(row) } : { criteria: [] }, 'clients')!.met).not.toBe(true)
  })

  it('stays undetermined while nobody has answered the criticality gate', () => {
    expect(dora.major(record()).met).toBeNull()
  })

  it('shows the aggregation rule on anything not established as major', () => {
    // An incident nobody has finished assessing is exactly one that may turn
    // out to aggregate.
    expect(dora.recurringNote(record())).toContain('Article 8(2)')
    expect(dora.recurringNote(critical({ doraMaliciousAccess: 'yes' }))).toBeNull()
  })
})

/**
 * A case that records nothing yet, against every regime at once.
 *
 * **The failure this exists to stop is named in the requirement**: collapsing
 * *not decidable* into *not reportable* "is how a notification deadline passes
 * while a screen says nothing is owed". Only one of those two answers is safe
 * to show an analyst who has not finished writing the case up.
 *
 * **Swept across the lenses rather than asserted on one.** Each decides
 * separately, so a lens that answered `false` on an empty record would be
 * invisible to a case written against its neighbour -- and every case above
 * this one is deliberately per-lens.
 */
describe('a case that records nothing yet', () => {
  const answers: [string, (row: ComplianceRow) => Determination][] = [
    ['GDPR article 33', (row) => gdpr.article33(row)],
    ['GDPR article 34', (row) => gdpr.article34(row)],
    ['NIS2 significance', (row) => nis2.significance(row)],
    ['DORA major', (row) => dora.major(row)],
  ]

  it.each(answers)('leaves %s undecided rather than answering no', (_name, answer) => {
    const decided = answer(record())

    expect(decided.met, 'a blank case was answered as though it had been assessed').toBeNull()
    // Stated separately from the null check on purpose: `false` is the one
    // wrong answer that reads as finished work, and this names it.
    expect(decided.met, 'a blank case says nothing is owed').not.toBe(false)
  })

  /**
   * **"Not yet" is only useful with "because these facts are unstated".** The
   * requirement asks for what is missing to be nameable, which is what turns
   * an undecided assessment into something an analyst can act on rather than a
   * screen that declines to answer.
   *
   * Read off the criteria the determination carries, which is where the answer
   * lives: `nis2.unassessedLimbs` is a narrower thing entirely -- limbs the app
   * stores no field for at all -- and answers nothing about a blank case.
   */
  it.each(answers)('says what %s is waiting on, not only that it is waiting', (_name, answer) => {
    const decided = answer(record())
    const open = decided.criteria.filter((one) => one.met === null)

    expect(open.length, 'undecided, and nothing named as the reason').toBeGreaterThan(0)
    expect(
      open.every((one) => one.label.trim() !== ''),
      'a criterion is unanswered and has no label to show an analyst',
    ).toBe(true)
  })
})

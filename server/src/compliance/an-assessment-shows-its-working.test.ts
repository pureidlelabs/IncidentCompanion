/**
 * **What an analyst is handed when they open an assessment** -- the second
 * requirement of `openspec/specs/compliance/spec.md`:
 *
 * > An assessment MUST name the regime, the article it rests on, and every
 * > criterion it weighed. Each criterion MUST say whether it is met, unmet or
 * > unstated, and MUST name the provision it comes from.
 * >
 * > An assessment MUST NOT be a number, a colour or a score. The analyst is the
 * > one who will defend the decision to a regulator, and they can only defend a
 * > reading of the instrument.
 *
 * **`complianceBreakdown` is what produces it, and nothing imported it.** The
 * lenses are covered in depth by `lenses.test.ts`, and every one of those cases
 * is about whether a limb is *decided correctly*. This file is about what the
 * analyst is shown: that the answer is a reading of an instrument rather than a
 * verdict on its own, and that a citation is attached to each part of it.
 *
 * Measured before writing it: `complianceBreakdown` is imported by
 * `compliance.service.ts` and `compliance.controller.ts` and by no test.
 */
import { describe, expect, it } from 'vitest'

import { complianceBreakdown } from './verdict.js'
import type { ComplianceRow } from './compliance.service.js'
import type { Policy } from '../domain/compliance-policy.js'

const POLICY: Policy = { authorityFloor: 'medium', subjectsFloor: 'high' }

const ALL = { nis2: true, gdpr: true, dora: true }

/** A case with nothing recorded, which every case starts as. */
function record(over: Partial<ComplianceRow> = {}): ComplianceRow {
  return { caseId: '00000000-0000-0000-0000-000000000000', ...over } as ComplianceRow
}

describe('an assessment shows its working', () => {
  /**
   * **In play means classified in scope**, so a case that has recorded nothing
   * names no regime at all -- which is the first requirement's business and is
   * asserted here only as this file's premise.
   */
  it('names no regime for a case that has recorded nothing', () => {
    expect(complianceBreakdown(record(), ALL, POLICY)).toEqual([])
  })

  /**
   * *An assessment is read*: it names the regime, the article, and every
   * criterion, and says which of them decided the outcome.
   */
  describe('a case in scope of NIS2', () => {
    const assessed = () =>
      complianceBreakdown(record({ nis2EntityClass: 'essential' }), ALL, POLICY)

    it('names the regime and the article it rests on', () => {
      const [nis2] = assessed()
      expect(nis2?.regime).toBe('NIS2')
      expect(nis2?.article, 'an assessment that cites no article cannot be defended').toBe(
        'Article 23',
      )
    })

    /**
     * **Every criterion carries its own provision**, not just the assessment.
     * An analyst defending one limb to a regulator quotes that limb's source,
     * and a criterion with an empty citation is the one they cannot.
     */
    it('cites a provision on every criterion it weighed', () => {
      const [nis2] = assessed()
      expect(nis2?.criteria.length, 'nothing was weighed, so nothing is being shown').toBeGreaterThan(
        0,
      )
      const uncited = (nis2?.criteria ?? []).filter((one) => !one.article)
      expect(uncited.map((one) => one.label), 'a criterion with no provision to quote').toEqual([])
    })

    /**
     * **Three values, and the criteria carry them too.** `met` is
     * `true | false | null`, and null is *unstated* rather than *unmet* -- the
     * distinction the first requirement exists for, asserted here on the shape
     * the analyst actually receives.
     */
    it('lets a criterion be unstated rather than forcing it to a boolean', () => {
      const [nis2] = assessed()
      for (const one of nis2?.criteria ?? []) {
        expect([true, false, null], `${one.label} is not one of the three values`).toContain(one.met)
      }
    })

    /**
     * **The assessment is not a score.** The requirement rules out a number, a
     * colour or a score in as many words, so the verdict is a tri-state and the
     * defensible part is the rule and the criteria beside it.
     */
    it('answers with a reading rather than a number', () => {
      const [nis2] = assessed()
      expect([true, false, null]).toContain(nis2?.verdict)
      expect(typeof nis2?.rule, 'the rule that carried it is what an analyst quotes').toBe('string')
      expect(nis2?.rule.length).toBeGreaterThan(0)
    })
  })

  /**
   * **GDPR stacks orthogonally and gets two rows**, one per article, which the
   * requirement's *name the article it rests on* makes necessary: Article 33
   * and Article 34 are different duties with different floors, and one row
   * carrying both could name neither.
   */
  it('answers the two GDPR articles separately, each naming its own', () => {
    const rows = complianceBreakdown(record({ personalDataInvolved: 'yes' }), ALL, POLICY)
    const gdpr = rows.filter((one) => one.regime === 'GDPR')

    expect(gdpr.map((one) => one.article)).toEqual(['Article 33', 'Article 34'])
    expect(new Set(gdpr.map((one) => one.detail)).size, 'the two rows are indistinguishable').toBe(2)
  })

  /**
   * **A regime the install has turned off is absent rather than undecided.**
   * The distinction matters to the analyst: undecided invites them to go and
   * answer something, and absent tells them not to.
   */
  it('omits a regime the install has disabled', () => {
    const off = { nis2: false, gdpr: true, dora: true }
    const rows = complianceBreakdown(record({ nis2EntityClass: 'essential' }), off, POLICY)

    expect(rows.filter((one) => one.regime === 'NIS2')).toEqual([])
  })
})

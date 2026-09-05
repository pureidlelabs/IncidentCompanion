/**
 * **An assessment is a reading of the case at a moment, and it moves** -- the
 * last requirement of `openspec/specs/compliance/spec.md`:
 *
 * > An assessment MUST be derived from what the case records rather than stored
 * > as a conclusion somebody reached.
 * >
 * > When a fact changes, the assessment MUST change with it, and the analyst
 * > MUST be told when a change moves an outcome -- particularly when it moves
 * > it towards something being owed.
 *
 * **Derived-not-stored is a property nothing can show by reading one
 * assessment.** It needs two: the same case with one fact different, answered
 * differently, with nothing persisted between them. A conclusion stored at the
 * moment somebody first opened the screen would pass every single-reading test
 * in this directory and fail here.
 *
 * The requirement's second half -- that the change is *apparent* rather than
 * needing the analyst to look again -- is the announce on the case channel, and
 * is asserted where the write happens.
 * -> `compliance.write.test.ts`, "announces the record rather than the case"
 */
import { describe, expect, it } from 'vitest'

import { complianceBreakdown } from './verdict.js'
import type { ComplianceRow } from './compliance.service.js'
import type { Policy } from '../domain/compliance-policy.js'

const POLICY: Policy = { authorityFloor: 'medium', subjectsFloor: 'high' }
const ALL = { nis2: true, gdpr: true, dora: true }

function record(over: Partial<ComplianceRow> = {}): ComplianceRow {
  return { caseId: '00000000-0000-0000-0000-000000000000', ...over } as ComplianceRow
}

/** The Article 33 row, which is the duty this file moves. */
const article33 = (row: ComplianceRow) =>
  complianceBreakdown(row, ALL, POLICY).find(
    (one) => one.regime === 'GDPR' && one.article === 'Article 33',
  )

/** A breach that is assessed and does not reach the authority floor. */
const quiet = record({
  personalDataInvolved: 'yes',
  gdprDataContext: 'simple',
  gdprIdentifiability: 'negligible',
  gdprCircumstances: [],
  gdprAwareAt: new Date('2026-08-01T00:00:00Z'),
})

/** The same breach, once the data turns out to be sensitive and identified. */
const grave = record({
  ...quiet,
  gdprDataContext: 'sensitive',
  gdprIdentifiability: 'maximum',
  gdprCircumstances: ['confidentiality', 'malicious'],
})

describe('an assessment moves with the case', () => {
  /**
   * The premise, asserted rather than assumed: the two rows differ in what the
   * case records and in nothing else the lens could be reading.
   */
  it('is the same case in both readings, differing only in the recorded facts', () => {
    expect(quiet.caseId).toBe(grave.caseId)
    expect(quiet.personalDataInvolved).toBe(grave.personalDataInvolved)
    expect(quiet.gdprAwareAt).toEqual(grave.gdprAwareAt)
  })

  it('reads the quieter breach as not reaching the authority', () => {
    expect(article33(quiet)?.verdict, 'the premise is that this one is decided, and no').toBe(false)
  })

  /**
   * **The direction the requirement calls out**: a change that moves the
   * outcome *towards something being owed*. A stored conclusion would still be
   * saying no.
   */
  it('answers that notification is owed once the facts are graver', () => {
    expect(article33(grave)?.verdict).toBe(true)
  })

  /**
   * **And it moves back**, which is what makes it a reading rather than a
   * ratchet. An assessment that could only ever harden would be a stored
   * conclusion with extra steps.
   */
  it('reads the quieter facts the same way after the graver ones', () => {
    article33(grave)
    expect(article33(quiet)?.verdict, 'the reading kept something from the last one').toBe(false)
  })

  /**
   * The criteria move with it too, not only the headline. An analyst reading
   * why it changed needs the limbs to have changed, and a verdict that flipped
   * over unchanged working would be the least defensible answer of all.
   */
  it('changes the working, not only the answer', () => {
    const before = JSON.stringify(article33(quiet)?.criteria)
    const after = JSON.stringify(article33(grave)?.criteria)
    expect(after, 'the verdict moved and the criteria under it did not').not.toBe(before)
  })
})

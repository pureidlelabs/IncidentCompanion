/**
 * **The application assesses; the organisation reports** -- the boundary
 * `openspec/specs/compliance/spec.md` draws and the constitution names:
 *
 * > The application MUST NOT notify an authority, and MUST NOT be the system of
 * > record for having done so.
 * >
 * > What the application MUST do is tell an analyst what is owed, to whom, by
 * > when, and what the case can say towards it -- and **record what the analyst
 * > says was done**.
 *
 * `readiness.ts` is what produces the line the Compliance block shows, and
 * this file is the only test that imports it -- the `readiness` hits elsewhere
 * in `server/src` are the health tier's unrelated boot readiness.
 *
 * **Two halves, and the second is the one a boundary needs.** That a recorded
 * notification closes its gap is ordinary behaviour. That the application never
 * says *it* notified anybody is the property the requirement exists for, and it
 * is a claim about the whole tier rather than about one function.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { readiness } from './readiness.js'
import type { ComplianceRow } from './compliance.service.js'
import type { Policy } from '../domain/compliance-policy.js'

const POLICY: Policy = { authorityFloor: 'medium', subjectsFloor: 'high' }
const ALL = { nis2: true, gdpr: true, dora: true }

function record(over: Partial<ComplianceRow> = {}): ComplianceRow {
  return { caseId: '00000000-0000-0000-0000-000000000000', ...over } as ComplianceRow
}

/**
 * A case where Article 33 is decided as owed.
 *
 * Built from the lens's own inputs rather than by asserting a verdict here --
 * whether these facts decide it is `lenses.test.ts`'s question, and the premise
 * case below fails loudly if they stop doing so.
 */
const owing = (over: Partial<ComplianceRow> = {}) =>
  record({
    personalDataInvolved: 'yes',
    gdprDataContext: 'sensitive',
    gdprIdentifiability: 'maximum',
    gdprCircumstances: ['confidentiality', 'malicious'],
    gdprAwareAt: new Date('2026-08-01T00:00:00Z'),
    ...over,
  })

const gdprGaps = (row: ComplianceRow): string[] =>
  readiness(row, ALL, POLICY).find((one) => one.regime === 'gdpr')?.gaps ?? []

describe('the application assesses and the organisation reports', () => {
  /** The premise: these facts do reach a notification being owed. */
  it('reports the authority notification as outstanding while it is owed', () => {
    const gaps = gdprGaps(owing())
    expect(
      gaps.some((one) => one.includes('supervisory authority')),
      `no gap mentions the authority: ${JSON.stringify(gaps)}`,
    ).toBe(true)
  })

  /**
   * *A notification was made.* Recording it closes the gap -- and nothing else
   * about the assessment moves, because what is *owed* and what has been *done*
   * are two facts. A lens that stopped reporting the obligation once it was
   * filed would erase the duty it was filed under.
   */
  it('stops reporting it once the analyst records that they notified', () => {
    const gaps = gdprGaps(owing({ gdprAuthorityNotifiedAt: new Date('2026-08-02T00:00:00Z') }))
    expect(gaps.some((one) => one.includes('supervisory authority'))).toBe(false)
  })

  /**
   * **The wording is the boundary.** *Recorded as notified* is the analyst's
   * report of their own act; *notified* would be the application claiming it.
   * The distinction is the whole requirement, and it lives in a string.
   */
  it('says the notification was recorded rather than that it was made', () => {
    const gaps = gdprGaps(owing())
    const authority = gaps.find((one) => one.includes('supervisory authority')) ?? ''
    expect(authority).toContain('recorded')
  })

  /**
   * **Nothing is sent, asserted over the tier rather than reasoned about.**
   *
   * The scenario's second clause is *AND nothing is sent*, which no unit test
   * of a lens can show. What can be shown is that the tier deciding all of this
   * holds no way to send anything: no outbound client, no transport.
   *
   * A sweep rather than a review, so a module added tomorrow is covered. It
   * reads the source because the property is about what the code *can* do, not
   * about what one call did.
   */
  it('holds no way to send anything to an authority', () => {
    const here = fileURLToPath(new URL('.', import.meta.url))
    const sources = readdirSync(here).filter(
      (name) => name.endsWith('.ts') && !name.includes('.test.'),
    )
    expect(sources.length, 'the sweep found no compliance sources').toBeGreaterThan(4)

    /** Ways out of this process, by the spelling each would appear as. */
    const OUTBOUND = ['fetch(', 'axios', 'node:http', 'node:https', 'nodemailer', 'sendmail']
    const offenders: string[] = []
    for (const name of sources) {
      const text = readFileSync(new URL(name, import.meta.url), 'utf8')
      // Comments describe the boundary constantly; the code is the subject.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
      for (const spelling of OUTBOUND) {
        if (code.includes(spelling)) offenders.push(`${name}: ${spelling}`)
      }
    }
    expect(offenders, 'the compliance tier can reach the network').toEqual([])
  })
})

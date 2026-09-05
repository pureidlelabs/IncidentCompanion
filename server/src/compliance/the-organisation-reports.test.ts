/**
 * **The application assesses; the organisation reports** -- the boundary
 * `openspec/specs/compliance/spec.md` draws and the constitution names:
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
   * are two facts.
   */
  it('stops reporting it once the analyst records that they notified', () => {
    const gaps = gdprGaps(owing({ gdprAuthorityNotifiedAt: new Date('2026-08-02T00:00:00Z') }))
    expect(gaps.some((one) => one.includes('supervisory authority'))).toBe(false)
  })

  /**
   * **The wording is the boundary.**
   */
  it('says the notification was recorded rather than that it was made', () => {
    const gaps = gdprGaps(owing())
    const authority = gaps.find((one) => one.includes('supervisory authority')) ?? ''
    expect(authority).toContain('recorded')
  })

  /**
   * **Nothing is sent, asserted over the tier rather than reasoned about.**
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

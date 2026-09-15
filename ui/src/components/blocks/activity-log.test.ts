import { describe, expect, it } from 'vitest'

import { detailSummary, matchesActivity, toneForAudit, type AuditRow } from './activity-log'
import { TONE_INK } from './severity-tones'

/**
 * **The activity log search reads the Activity column and nothing else.**
 *
 * The person who initiated a line, what it acted on and where it came from
 * are three columns beside Activity, and the defect this is written against
 * is a search matching all four under a label promising one.
 *
 * Written from the attack: the assertion that matters is the negative one.
 */

const line: AuditRow = {
  id: 'l1',
  at: '2026-08-20T09:14:00.000Z',
  severity: 'High',
  activity: 'Password changed',
  channel: 'authentication',
  outcome: 'Success',
  actor: 'Rachel Okonkwo',
  target: 'svc-backup',
  source: '198.51.100.7',
  runLength: 1,
  attributes: { account: 'svc-backup@example.test' },
  detailsVary: false,
}

/**
 * **The audit scale is OCSF's six points, the ramp is the product's five.**
 *
 * So the log declares a mapping rather than reusing `toneFor`, which answers
 * `none` for `Fatal` -- grey, for the most severe line there is. What it must
 * not do is declare the *colours* again: a private map is how `Low` came to be
 * lettered `text-severity-low`, which the tokens measure at 1.81:1 and is the
 * reason the `-type` pair exists, and how `Critical` and `High` came to be the
 * same hue. -> #659
 */
describe('the audit log paints severity from the shared ramp', () => {
  it('letters Low with the readable token rather than the fill', () => {
    expect(TONE_INK[toneForAudit('Low')]).toBe('text-severity-low-type')
  })

  it('tells Critical and High apart', () => {
    expect(TONE_INK[toneForAudit('Critical')]).not.toBe(TONE_INK[toneForAudit('High')])
  })

  it('paints Fatal as the top of the ramp rather than as unknown', () => {
    expect(toneForAudit('Fatal')).toBe('critical')
  })

  it('has a tone for every severity the reader can return', () => {
    const scale: AuditRow['severity'][] = [
      'Fatal',
      'Critical',
      'High',
      'Medium',
      'Low',
      'Informational',
    ]
    for (const one of scale) expect(TONE_INK[toneForAudit(one)], one).toBeTruthy()
    // Not all one colour, which a mapping to a single tone would also satisfy.
    expect(new Set(scale.map((one) => TONE_INK[toneForAudit(one)])).size).toBeGreaterThan(4)
  })
})

describe('the activity log search reads the Activity column', () => {
  it('matches a word in the activity', () => {
    expect(matchesActivity(line, 'password')).toBe(true)
  })

  it.each([
    ['Initiated by', 'okonkwo'],
    ['Target', 'svc-backup'],
    ['Source', '198.51.100.7'],
    // The Detail column is drawn and not searched, for the reason the three
    // above are not: the field is labelled for the Activity column alone.
    ['Detail', 'svc-backup@example.test'],
  ])('refuses a value that is only in %s', (_column, term) => {
    expect(matchesActivity(line, term)).toBe(false)
  })

  it('is AND across terms, so a second word narrows rather than widens', () => {
    expect(matchesActivity(line, 'password changed')).toBe(true)
    expect(matchesActivity(line, 'password okonkwo')).toBe(false)
  })
})

/**
 * What the Detail column says, which is the run's claim about itself.
 *
 * **The run reports its head.** A value drawn from one line reads as every
 * line's, so a run whose lines disagree says that instead of naming a
 * specimen -- and it says it about the run rather than about a field, because
 * one flag over the whole record is all the reader has.
 */
describe('the Detail column', () => {
  const varying = (over: Partial<AuditRow>): AuditRow => ({ ...line, ...over })

  it('names the values when the run agrees', () => {
    expect(detailSummary(varying({ runLength: 3, detailsVary: false }))).toBe(
      'account: svc-backup@example.test',
    )
  })

  it('says so instead when the run disagrees', () => {
    expect(detailSummary(varying({ runLength: 3, detailsVary: true }))).toBe('varies')
  })

  it('says so even where the head recorded nothing', () => {
    // The head of a run can carry no detail while the lines behind it do:
    // the same event is written with and without one.
    expect(detailSummary(varying({ attributes: {}, runLength: 4, detailsVary: true }))).toBe(
      'varies',
    )
  })

  it('has nothing to say for a line that recorded nothing', () => {
    expect(detailSummary(varying({ attributes: {}, detailsVary: false }))).toBeNull()
  })
})

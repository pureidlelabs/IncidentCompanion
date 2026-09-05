import { describe, expect, it } from 'vitest'

import { matchesActivity, type AuditRow } from './activity-log'

/**
 * **The activity log search reads the Activity column and nothing else.**
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
}

describe('the activity log search reads the Activity column', () => {
  it('matches a word in the activity', () => {
    expect(matchesActivity(line, 'password')).toBe(true)
  })

  it.each([
    ['Initiated by', 'okonkwo'],
    ['Target', 'svc-backup'],
    ['Source', '198.51.100.7'],
  ])('refuses a value that is only in %s', (_column, term) => {
    expect(matchesActivity(line, term)).toBe(false)
  })

  it('is AND across terms, so a second word narrows rather than widens', () => {
    expect(matchesActivity(line, 'password changed')).toBe(true)
    expect(matchesActivity(line, 'password okonkwo')).toBe(false)
  })
})

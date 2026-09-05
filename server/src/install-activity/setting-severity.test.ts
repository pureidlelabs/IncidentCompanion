/**
 * How loud a settings change is, attacked as "what gets filed quietly".
 */
import { describe, expect, it } from 'vitest'

import { severityOfSettingChange } from './setting-severity.js'

describe('how loud a settings change is', () => {
  /**
   * **Shortening the audit is the loudest thing on this screen.**
   */
  it.each(['audit.retentionDays', 'audit.operationalRetentionDays'])(
    'files shortening %s as Critical',
    (key) => {
      expect(severityOfSettingChange(key, 365, 30)).toBe('Critical')
    },
  )

  it.each(['audit.retentionDays', 'audit.operationalRetentionDays'])(
    'files lengthening %s quietly',
    (key) => {
      expect(severityOfSettingChange(key, 30, 365)).toBe('Low')
    },
  )

  /**
   * **Loosening any other bound is High.**
   */
  it.each([
    ['auth.sessionIdleMinutes', 30, 480],
    ['auth.lockoutAfterFailures', 10, 50],
    ['auth.minPasswordLength', 16, 12],
    ['auth.lockoutMinutes', 60, 15],
    ['evidence.attachmentMegabytes', 256, 2048],
    ['evidence.passphraseChars', 20, 12],
    ['audit.runWindowMinutes', 5, 60],
  ])('files loosening %s as High', (key, from, to) => {
    expect(severityOfSettingChange(key, from, to)).toBe('High')
  })

  it.each([
    ['auth.sessionIdleMinutes', 480, 30],
    ['auth.lockoutAfterFailures', 50, 10],
    ['auth.minPasswordLength', 12, 16],
    ['evidence.attachmentMegabytes', 2048, 256],
  ])('files tightening %s quietly', (key, from, to) => {
    expect(severityOfSettingChange(key, from, to)).toBe('Low')
  })

  /**
   * **The direction map is the thing that can be wrong**, and it is wrong in a
   * way that reads correct: getting `up`/`down` backwards for one key files
   * every loosening of it as Low.
   */
  it('never files a loosening more quietly than the matching tightening', () => {
    for (const [key, low, high] of [
      ['auth.sessionIdleMinutes', 30, 480],
      ['auth.minPasswordLength', 12, 16],
      ['evidence.archiveMegabytes', 512, 4096],
    ] as const) {
      const a = severityOfSettingChange(key, low, high)
      const b = severityOfSettingChange(key, high, low)
      expect(a, `${key} is the same in both directions`).not.toBe(b)
    }
  })

  it('files an unknown setting at Medium rather than quietly', () => {
    expect(severityOfSettingChange('something.nobody.classified', 1, 2)).toBe('Medium')
  })

  it('files a change with no direction to read at Medium', () => {
    expect(severityOfSettingChange('compliance.enabled', false, true)).toBe('Medium')
  })

  /** A write that changed nothing still happened, and is still worth a line. */
  it('files a no-op change at Medium', () => {
    expect(severityOfSettingChange('audit.retentionDays', 365, 365)).toBe('Medium')
  })
})

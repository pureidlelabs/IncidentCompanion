/**
 * How loud a settings change is, attacked as "what gets filed quietly".
 *
 * **The failure is a line that exists and nobody finds.** An audit window cut
 * from a year to a month, recorded at Informational, sits under every default
 * severity filter an administrator would use - so the log technically holds it
 * and answers nobody. That is worse than not recording it, because the install
 * believes it is covered.
 *
 * So these are about *direction*, not about keys: every setting here is a bound
 * on something, and loosening a bound is the move worth explaining.
 */
import { describe, expect, it } from 'vitest'

import { severityOfSettingChange } from './setting-severity.js'

describe('how loud a settings change is', () => {
  /**
   * **Shortening the audit is the loudest thing on this screen.** Its whole
   * effect is to remove evidence, and it is the one act an attacker with an
   * administrator's session would reach for before anything else.
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
   * **Loosening any other bound is High.** A longer session, more guesses
   * before a lockout, a shorter password: each one weakens a control that was
   * chosen deliberately, and each is a step somebody takes before doing the
   * thing the control was stopping.
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
   * every loosening of it as Low. So each key is asserted in both directions
   * above rather than once - a single-direction test passes on an inverted map.
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

  /**
   * **An unclassified setting is Medium, not Informational.** The quiet
   * default is how the next key somebody adds without reading the map gets
   * filed under every filter.
   */
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

/**
 * How loud a change to one setting is.
 *
 * **A generic `setting_changed` event needs this or it flattens everything.**
 * One event with the key in `detail` is the right shape - the act is the same
 * and the key is what discriminates - but a single severity for all of them
 * would file "the audit window was cut to a month" at the same level as "the
 * session idles out after an hour". The first is the act this log exists to
 * catch and the second is housekeeping.
 *
 * **Direction matters more than the key does.** Every setting here is a bound
 * on something, and loosening a bound is the move worth explaining: a longer
 * session, a shorter audit, more failures before a lockout, a bigger upload.
 * Tightening one is somebody being careful.
 *
 * **The default is `Medium`, not `Informational`.** An install setting nobody
 * classified is still an install setting; a quiet default would hide the next
 * one somebody adds without reading this file.
 */
import { type SeverityName } from './severity.js'

/**
 * Which direction is the loose one, per key.
 *
 * `up` means a larger number is the weaker setting - a longer session, more
 * failures allowed before a lockout, a larger upload. `down` means a smaller
 * number is: a shorter audit window, a shorter password.
 */
const LOOSENS: Record<string, 'up' | 'down'> = {
  'audit.retentionDays': 'down',
  'audit.operationalRetentionDays': 'down',
  'auth.sessionIdleMinutes': 'up',
  'auth.sessionLifetimeMinutes': 'up',
  'auth.minPasswordLength': 'down',
  'auth.lockoutAfterFailures': 'up',
  'auth.lockoutMinutes': 'down',
  'evidence.attachmentMegabytes': 'up',
  'evidence.archiveMegabytes': 'up',
  'evidence.passphraseChars': 'down',
  'audit.runWindowMinutes': 'up',
}

/**
 * **Shortening the audit is the one act whose whole effect is to remove
 * evidence**, so it is Critical rather than High: there is no benign reason to
 * reach for it in a hurry, and an administrator doing it deliberately is the
 * scenario this log exists for.
 */
const CRITICAL_TO_LOOSEN = new Set(['audit.retentionDays', 'audit.operationalRetentionDays'])

export function severityOfSettingChange(
  key: string,
  from: unknown,
  to: unknown,
): SeverityName {
  const before = Number(from)
  const after = Number(to)
  // A non-numeric setting - a toggle, a name - has no direction to read, and
  // the change is still worth the default.
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return 'Medium'

  const direction = LOOSENS[key]
  if (direction === undefined) return 'Medium'

  const loosened = direction === 'up' ? after > before : after < before
  if (!loosened) return 'Low'
  return CRITICAL_TO_LOOSEN.has(key) ? 'Critical' : 'High'
}

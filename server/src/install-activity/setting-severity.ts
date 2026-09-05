/**
 * How loud a change to one setting is.
 */
import { type SeverityName } from './severity.js'

/**
 * Which direction is the loose one, per key.
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

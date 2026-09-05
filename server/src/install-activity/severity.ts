/**
 * An audit line's severity and outcome, in the words the standards use.
 */
import type { InstallEvent } from './record.js'
import { severityOfSettingChange } from './setting-severity.js'

/** ECS `event.outcome`. */
export type Outcome = 'success' | 'failure' | 'unknown'

/**
 * OCSF `severity_id`, which is the framework's own six-point scale.
 */
export const SEVERITY_ID = {
  Informational: 1,
  Low: 2,
  Medium: 3,
  High: 4,
  Critical: 5,
  Fatal: 6,
} as const

export type SeverityName = keyof typeof SEVERITY_ID

/** The reverse, for a row that stores the id. */
export const SEVERITY_NAME: Record<number, SeverityName> = Object.fromEntries(
  Object.entries(SEVERITY_ID).map(([name, id]) => [id, name as SeverityName]),
)

/**
 * Events that describe something being refused.
 */
export const FAILURES: ReadonlySet<InstallEvent> = new Set<InstallEvent>([
  'sign_in_failed',
  'access_denied',
  'live_refused',
  // A refusal, so `outcomeOf` reports failure: the caller did not get what
  // it asked for, and a log that called this a success would be wrong in
  // the one column a collector filters on.
  'rate_limited',
])

/**
 * Always at least `Low`: they change what somebody can reach, or destroy a
 * record. Everything else earns its level from context.
 */
const ALWAYS_NOTEWORTHY: ReadonlySet<InstallEvent> = new Set<InstallEvent>([
  'account_role_changed',
  'account_disabled',
  'account_enabled',
  'account_created',
  'account_password_reset',
  'case_deleted',
  // Moving a case between customers moves who reaches it, which is the first
  // half of this set's criterion said in as many words.
  'case_attributed',
  'library_kind_replaced',
  'regime_switched',
  'report_language_uploaded',
  'report_language_removed',
  // Evidence leaving the app is the highest-value read this app offers.
  'evidence_read',
  'data_exported',
  'case_opened_live',
])

export interface Judged {
  event: InstallEvent
  /** How many of this event, from this origin, sit in the same short window. */
  runLength?: number | undefined
  attributes?: Record<string, string> | undefined
}

/**
 * A run of failures is the finding; one failure is a typo.
 */
export const RUN_IS_AN_ATTACK = 3

export function outcomeOf(event: InstallEvent): Outcome {
  return FAILURES.has(event) ? 'failure' : 'success'
}

export function severityOf({ event, runLength = 1, attributes }: Judged): SeverityName {
  /**
   * **A settings change reads its own key and direction.**
   */
  if (event === 'setting_changed') {
    return severityOfSettingChange(
      String(attributes?.['key'] ?? ''),
      attributes?.['from'],
      attributes?.['to'],
    )
  }
  /**
   * **Shortening the window is louder than lengthening it**, because it is the
   * one act whose effect is to remove evidence.
   */
  if (event === 'audit_retention_changed') {
    const from = Number(attributes?.['from'] ?? 0)
    const to = Number(attributes?.['to'] ?? 0)
    return to < from ? 'Critical' : 'Medium'
  }
  if (FAILURES.has(event) && runLength >= RUN_IS_AN_ATTACK) return 'High'
  // **A promotion is louder than a demotion**, because the risk is asymmetric:
  // handing somebody the installation is the change that needs explaining.
  // **A lockout is the run's conclusion, so it carries the run's level.**
  // Ten failures against one account is the thing this log exists to make
  // findable, and it must not read quieter than the failures did.
  if (event === 'account_locked') return 'High'
  if (event === 'account_role_changed' && attributes?.['to'] === 'admin') return 'High'
  if (event === 'case_deleted') return 'Medium'
  if (FAILURES.has(event) || ALWAYS_NOTEWORTHY.has(event)) return 'Low'
  return 'Informational'
}

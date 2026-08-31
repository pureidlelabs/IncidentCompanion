/**
 * An audit line's severity and outcome, in the words the standards use.
 *
 * **Neither is invented and neither is typed at the call site.** The first
 * version of this file had `critical | notice | info`, which is nothing's
 * vocabulary - log semantics are standardised and there is no reason to guess
 * at them:
 *
 * - **`outcome` is ECS `event.outcome`**: `success`, `failure`, `unknown`.
 *   Elastic's own definition is *whether the event represents a success or a
 *   failure from the perspective of the entity that produced the event*, and
 *   `unknown` is for an event describing only an attempt. Entra's audit calls
 *   the same column Status and carries the same two values.
 * - **`severity_id` is OCSF's**: `1 Informational, 2 Low, 3 Medium, 4 High,
 *   5 Critical, 6 Fatal`. OCSF is what a security product's log is read in -
 *   Sentinel, Splunk and Security Lake all ingest it - so its scale wins over
 *   OpenTelemetry's INFO/WARN/ERROR, which this file carried for one commit.
 *
 * `status_id` is OCSF's too (`1 Success, 2 Failure`) and agrees with ECS's
 * `event.outcome`, which is why `outcome` can be both at once.
 *
 * **Derived, because a level chosen at the call site is a level somebody tunes
 * down the day it is inconvenient** - and because the writer cannot know what
 * the reader can: a single failed sign-in is Informational and the fifth in
 * five minutes is not.
 *
 * -> <https://schema.ocsf.io/1.7.0/classes/base_event>
 * -> <https://www.elastic.co/docs/reference/ecs/ecs-allowed-values-event-outcome>
 */
import type { InstallEvent } from './record.js'
import { severityOfSettingChange } from './setting-severity.js'

/** ECS `event.outcome`. */
export type Outcome = 'success' | 'failure' | 'unknown'

/**
 * OCSF `severity_id`, which is the framework's own six-point scale.
 *
 * **Not OTel's INFO/WARN/ERROR and not this app's incident ramp.** OCSF is
 * what a security product's log is read in, and its numbers are what a
 * collector filters on. Verified against the published schema by
 * `ocsf.test.ts` rather than trusted, because npm has no OCSF package to
 * import these from - the framework ships Java and Python tools only.
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
 *
 * **A refusal is its own event here rather than a status on an attempt**, so
 * the outcome is a property of which event it is. Nothing else in this
 * vocabulary can fail: a role change that did not happen writes no line.
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
 *
 * **Three, and the number is the rate limiter's rather than a guess.**
 * `auth/rate-limit.ts` is what an attacker meets, so a run reaching the same
 * count is one that was being throttled - which is where an administrator
 * wants to see it rather than scroll past it.
 */
export const RUN_IS_AN_ATTACK = 3

export function outcomeOf(event: InstallEvent): Outcome {
  return FAILURES.has(event) ? 'failure' : 'success'
}

export function severityOf({ event, runLength = 1, attributes }: Judged): SeverityName {
  /**
   * **A settings change reads its own key and direction.** Every other event
   * here has one level; this one covers ten settings whose loosening matters
   * very differently, so the level comes from the attributes the writer
   * carried. -> `setting-severity.ts`
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
   * one act whose effect is to remove evidence. Critical rather than High: an
   * administrator doing this deliberately is the scenario the audit exists
   * for, and there is no benign reason to reach for it in a hurry.
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

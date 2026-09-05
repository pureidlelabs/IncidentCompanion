/**
 * Which retention window a line falls under.
 *
 * **Per event, not per channel, and the channel is the tempting wrong
 * answer.** `case` and `operations` read like "the operational half", and
 * splitting there would put three of the most evidentiary lines this install
 * writes into the short bucket:
 *
 * | event | channel | what shortening it loses |
 * | --- | --- | --- |
 * | `audit_retention_changed` | operations | who shortened the audit |
 * | `case_deleted` | case | who destroyed a case |
 * | `data_exported` | case | what left the install |
 *
 * - while keeping `api_called` - the highest-volume line here - for a year.
 * The channel says which log an administrator reads; it does not say what the
 * line is worth.
 *
 * **The default is `audit`, and it is a default rather than a listing.** A new
 * event added without a thought lands in the long bucket, which costs disk;
 * the other way round it silently loses evidence. Only the names below are
 * short, and each is there because it answers no question after the incident
 * it belongs to is closed.
 */
import type { InstallEvent } from './record.js'

export const RETENTION_CLASSES = ['audit', 'operational'] as const
export type RetentionClass = (typeof RETENTION_CLASSES)[number]

/**
 * The lines that are volume rather than evidence.
 *
 * - `api_called` is every mutating request; on a working install it is most of
 *   the table.
 * - `case_opened_live` is a socket connecting, which happens on every screen.
 * - `rate_limited` is a refusal, and its value is in the days around it rather
 *   than a year later - the sign-in failures it accompanies are `audit`.
 * - `install_started` is a restart.
 *
 * **A refusal that names an account is not here.** `sign_in_failed`,
 * `access_denied`, `live_refused` and `account_locked` all answer *who tried
 * to reach what*, which is the question asked longest after the fact.
 */
const OPERATIONAL: ReadonlySet<string> = new Set<string>([
  'install_started',
  'api_called',
  'case_opened_live',
  'rate_limited',
])

export function retentionClassOf(event: InstallEvent): RetentionClass {
  return OPERATIONAL.has(event) ? 'operational' : 'audit'
}

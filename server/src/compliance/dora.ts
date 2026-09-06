/**
 * DORA Article 19: is this a major ICT-related incident.
 *
 * Delegated Regulation (EU) 2024/1772 sets the test, and Article 8(1) is a gate
 * over a gate: the incident must have **affected critical services** (Article
 * 6) *and* then either meet Article 9(5)(b) alone or **two or more** of the
 * other Article 9 thresholds.
 *
 * **Nothing checks these figures automatically.** They are verified by hand
 * against `tests/data/dora-rts-2024-1772-articles.json`, and a test asserting
 * them against that file is what would keep them true.
 *
 * **9(5)(b) is sufficient on its own and the others are not.** A successful,
 * malicious and unauthorised access that may result in data losses makes an
 * incident major with nothing else met - the one asymmetry a plain "two of
 * seven" erases, and it erases it in the direction of under-reporting.
 *
 * **Every threshold is strictly greater than, never "at least".** The RTS says
 * *higher than 10 %*, *longer than 24 hours*, *exceeded EUR 100 000*. At
 * exactly the number the threshold is **not** met. `over` survives beside
 * `gates.threshold` for its share formatting rather than for its comparison.
 *
 * **A definite "not major" needs every ground answered, not merely unclaimed.**
 * `no` is a real finding and Article 8(1)(b) can fall below two - but an
 * *unanswered* ground still counts toward what is possible, so silence keeps
 * the verdict undetermined rather than turning it negative. That asymmetry is
 * the whole point of `atLeast`.
 *
 * **The shared figures are shared on purpose.** Downtime, affected users, the
 * total user base and the Member State list are one measured fact each, asked
 * at NIS2's limits and at DORA's; a `dora`-prefixed copy would be two numbers
 * about one outage. `doraDurationMinutes` is *not* one of them: 9(3)(a) runs
 * from occurrence to resolution while downtime counts only the outage.
 */
import {
  anyOf,
  atLeast,
  criterion,
  deciding,
  gate,
  ground,
  type Criterion,
  type Determination,
} from './gates.js'
import type { ComplianceRow } from './compliance.service.js'

/** Article 9's published limits, in one place because a regulator would query them. */
export const CLIENT_SHARE = 0.1 // 9(1)(a) higher than 10 %
export const CLIENT_COUNT = 100_000 // 9(1)(b) higher than 100 000
export const DURATION_MINUTES = 24 * 60 // 9(3)(a) longer than 24 hours
export const DOWNTIME_MINUTES = 2 * 60 // 9(3)(b) longer than 2 hours
export const MEMBER_STATES = 2 // 9(4) two or more Member States
export const COSTS_EUR = 100_000 // 9(6) exceeded EUR 100 000

/** Article 8(1)(b): *two or more* of the other thresholds. */
export const OTHER_THRESHOLDS_NEEDED = 2

/**
 * Article 9 limbs this app stores no field for.
 *
 * Reported under the verdict rather than dropped: a case can miss the
 * two-threshold bar on the limbs testable here and cross it on a transaction
 * figure nobody was asked for.
 */
export const UNSTORED_LIMBS: readonly string[] = [
  'affected financial counterparts, as a share of all counterparts (Art 9(1)(c))',
  'number of affected transactions, against the daily average (Art 9(1)(d))',
  'value of affected transactions, against the daily average (Art 9(1)(e))',
]

const stated = (n: number | null | undefined): n is number => n !== null && n !== undefined

/**
 * A strictly-greater-than criterion.
 *
 * **Separate from `gates.threshold` for the formatting, not the comparison.**
 * Both are strictly greater. A DORA limb can be a *share*, and `figure`/`bound`
 * print `0.1` as `10%` where the helper prints `0.1`.
 *
 * `null` is unstated; `0` is a measurement, for the reason `gates.ts` gives.
 */
function over(
  key: string,
  label: string,
  value: number | null | undefined,
  limit: number,
  article: string,
  unit = '',
): Criterion {
  if (!stated(value)) return criterion(key, label, null, article, 'not stated')
  const suffix = unit ? ` ${unit}` : ''
  const figure = (n: number) =>
    n >= 1
      ? Math.round(n).toLocaleString('en-GB').replace(/,/g, ' ')
      : `${(n * 100).toFixed(1)}%`
  const bound = (n: number) =>
    n >= 1 ? Math.round(n).toLocaleString('en-GB').replace(/,/g, ' ') : `${(n * 100).toFixed(0)}%`
  return criterion(
    key,
    label,
    value > limit,
    article,
    `${figure(value)}${suffix} against ${bound(limit)}${suffix}`,
  )
}

/**
 * Article 6: did the incident affect critical services.
 *
 * An OR of three limbs, and **unstated is undetermined rather than out of
 * scope**: reading silence as a finding would file every unassessed case as not
 * major, and the screen would then say so.
 */
export function inScope(row: ComplianceRow): Determination {
  return anyOf(
    [
      ground(
        'critical_functions',
        'Supports critical or important functions',
        row.doraCriticalFunctions,
        'Art 6(a)',
      ),
      ground(
        'supervised',
        'Authorised, registered or supervised financial services',
        row.doraSupervisedServices,
        'Art 6(b)',
      ),
      ground(
        'malicious_access',
        'Successful malicious unauthorised access',
        row.doraMaliciousAccess,
        'Art 6(c)',
      ),
    ],
    'Criticality of services affected (Article 6)',
  )
}

/**
 * 9(1)(a): affected clients as a share of clients using the service.
 *
 * **Undetermined without both figures.** Dividing by a zero total is the
 * obvious crash; the quieter fault is reading an unstated total as "all of
 * them" and reporting 100 % of an unknown base.
 */
function clientShare(row: ComplianceRow): Criterion {
  if (!stated(row.usersAffectedCount) || !row.usersTotalCount) {
    return criterion(
      'client_share',
      'Share of clients affected',
      null,
      'Art 9(1)(a)',
      'affected and total not both stated',
    )
  }
  return over(
    'client_share',
    'Share of clients affected',
    row.usersAffectedCount / row.usersTotalCount,
    CLIENT_SHARE,
    'Art 9(1)(a)',
  )
}

const detailsOf = (determination: Determination) =>
  deciding(determination)
    .map((one) => one.detail)
    .filter(Boolean)
    .join('; ')

/**
 * 9(3) as one criterion over its two limbs, so a long *and* disruptive incident
 * does not count twice toward Article 8(1)(b)'s two.
 */
function duration(row: ComplianceRow): Criterion {
  const combined = anyOf([
    over('duration', 'Incident duration', row.doraDurationMinutes, DURATION_MINUTES, 'Art 9(3)(a)', 'minutes'),
    over('downtime', 'Service downtime', row.serviceDowntimeMinutes, DOWNTIME_MINUTES, 'Art 9(3)(b)', 'minutes'),
  ])
  return criterion(
    'duration',
    'Duration or service downtime',
    combined.met,
    'Art 9(3)',
    detailsOf(combined),
  )
}

/**
 * The Article 9 limbs other than 9(5)(b), in the RTS's own order.
 *
 * **9(1) is itself an OR of six limbs and counts as one threshold** toward
 * Article 8(1)(b)'s two, so its testable limbs fold into a single criterion.
 * Listing them flat would let one paragraph supply both thresholds on its own
 * and make almost every incident major.
 */
export function thresholds(row: ComplianceRow): Criterion[] {
  const clients = anyOf([
    clientShare(row),
    over('client_count', 'Clients affected', row.usersAffectedCount, CLIENT_COUNT, 'Art 9(1)(b)'),
    ground('relevant_clients', 'A relevant client or counterpart', row.doraRelevantClients, 'Art 9(1)(f)'),
  ])
  const states = (row.affectedMemberStates ?? []).length

  return [
    criterion(
      'clients',
      'Clients, counterparts and transactions',
      clients.met,
      'Art 9(1)',
      detailsOf(clients),
    ),
    ground('reputational', 'Reputational impact', row.doraReputationalImpact, 'Art 9(2)'),
    duration(row),
    criterion(
      'geography',
      'Two or more Member States',
      states ? states >= MEMBER_STATES : null,
      'Art 9(4)',
      states ? `${states} stated` : 'not stated',
    ),
    ground('data_losses', 'Data losses with an adverse impact', row.doraDataAdverseImpact, 'Art 9(5)(a)'),
    over('costs', 'Costs and losses', row.doraCostsEur, COSTS_EUR, 'Art 9(6)', 'EUR'),
  ]
}

/**
 * Article 8(1): a major ICT-related incident, or not.
 *
 * The two routes are evaluated as an OR *inside* the criticality gate rather
 * than as two determinations, so the breakdown is one list the analyst reads
 * down - and so 9(5)(b) firing alone still shows the gate it had to pass.
 */
export function major(row: ComplianceRow): Determination {
  const malicious = {
    ...ground(
      'malicious_data_access',
      'Malicious unauthorised access that may result in data losses',
      row.doraMaliciousAccess,
      'Art 9(5)(b)',
    ),
    detail: 'sufficient on its own (Article 8(1)(a))',
  }
  const others = atLeast(
    OTHER_THRESHOLDS_NEEDED,
    thresholds(row),
    `${OTHER_THRESHOLDS_NEEDED} or more Article 9 thresholds (Article 8(1)(b))`,
  )
  // **`anyOf`, not a ternary.** A hand-rolled OR reads an unanswered 9(5)(b)
  // as a no, so a case whose other thresholds fall short returns a definite
  // "not major" on a limb nobody was asked - and `verdict.ts` renders the
  // deciding criteria only, so the unasked limb is `null`, undecided, and
  // dropped from the breakdown as well.
  const route: Determination = {
    met: anyOf([malicious, criterion('thresholds', others.rule, others.met, 'Art 8(1)(b)')]).met,
    criteria: [malicious, ...others.criteria],
    rule: others.rule,
  }
  return gate([inScope(row), route], 'DORA Article 19 \u2014 major ICT-related incident')
}

/**
 * Article 9 limbs the case stores no field for.
 *
 * Unconditional: unlike NIS2's, these are missing for every entity rather than
 * for particular ones, so there is nothing to key on.
 */
export function unassessedLimbs(): readonly string[] {
  return UNSTORED_LIMBS
}

/**
 * Article 8(2): individually minor incidents can aggregate into one major
 * incident.
 *
 * **A note rather than a criterion**, because the test is over *other cases* -
 * at least twice in six months with the same apparent root cause - and this app
 * holds one case at a time. Stating the rule where the verdict is read is the
 * honest half; computing it would need a corpus the app does not have.
 *
 * Shown on any verdict **not established as major**, undetermined included: an
 * incident nobody has finished assessing is exactly one that may turn out to
 * aggregate, so waiting for a definite no would show the rule only where it has
 * stopped mattering.
 */
export function recurringNote(row: ComplianceRow): string | null {
  if (major(row).met === true) return null
  return (
    'Recurring incidents with the same apparent root cause, twice or more within ' +
    '6 months, are assessed together as one major incident (Article 8(2)). ' +
    'Microenterprises and Article 16(1) entities are outside that rule.'
  )
}

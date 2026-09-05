/**
 * DORA Article 19: is this a major ICT-related incident.
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
 */
export const UNSTORED_LIMBS: readonly string[] = [
  'affected financial counterparts, as a share of all counterparts (Art 9(1)(c))',
  'number of affected transactions, against the daily average (Art 9(1)(d))',
  'value of affected transactions, against the daily average (Art 9(1)(e))',
]

const stated = (n: number | null | undefined): n is number => n !== null && n !== undefined

/**
 * A strictly-greater-than criterion.
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
 */
export function unassessedLimbs(): readonly string[] {
  return UNSTORED_LIMBS
}

/**
 * Article 8(2): individually minor incidents can aggregate into one major
 * incident.
 */
export function recurringNote(row: ComplianceRow): string | null {
  if (major(row).met === true) return null
  return (
    'Recurring incidents with the same apparent root cause, twice or more within ' +
    '6 months, are assessed together as one major incident (Article 8(2)). ' +
    'Microenterprises and Article 16(1) entities are outside that rule.'
  )
}

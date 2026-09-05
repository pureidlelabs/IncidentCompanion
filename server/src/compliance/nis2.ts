/**
 * NIS2 Article 23: is this a significant incident, and under which test.
 *
 * **Every figure here is lifted from the vendored OJ text**, never retyped -
 * a test asserting the constants against themselves cannot see a wrong limb.
 */
import {
  COMPLETE_OUTAGE_MINUTES,
  GENERAL_LOSS_EUR,
  GENERAL_LOSS_TURNOVER_SHARE,
  IR_ARTICLES,
  LIMITED_AVAILABILITY,
  UNSTORED_LIMBS,
  USER_SHARE_ONLY,
} from './nis2-thresholds.js'
import {
  allOf,
  anyOf,
  criterion,
  gate,
  ground,
  threshold,
  type Criterion,
  type Determination,
} from './gates.js'
import type { ComplianceRow } from './compliance.service.js'

const stated = (n: number | null | undefined): n is number => n !== null && n !== undefined
const shown = (n: number) => n.toLocaleString('en-GB').replace(/,/g, ' ')

/**
 * The gate every determination sits behind.
 */
export function inScope(row: ComplianceRow): Criterion {
  if (!row.nis2EntityClass) {
    return criterion('scope', 'In NIS2 scope', null, 'Art 2', 'entity classification not stated')
  }
  const covered = row.nis2EntityClass === 'essential' || row.nis2EntityClass === 'important'
  return criterion('scope', 'In NIS2 scope', covered, 'Art 2', `${row.nis2EntityClass} entity`)
}

/**
 * `quantified`, `qualitative`, or `''` when the type is unstated.
 */
export function track(row: ComplianceRow): 'quantified' | 'qualitative' | '' {
  if (!row.nis2EntityType) return ''
  return row.nis2EntityType in IR_ARTICLES ? 'quantified' : 'qualitative'
}

/**
 * Article 23(3): any one ground makes the incident significant.
 */
export function qualitativeGrounds(row: ComplianceRow): Determination {
  return anyOf(
    [
      ground(
        'severe_disruption',
        'Severe operational disruption or financial loss',
        row.nis2SevereDisruption,
        'Art 23(3)(a)',
      ),
      ground(
        'considerable_damage',
        'Considerable material or non-material damage to others',
        row.nis2ConsiderableDamage,
        'Art 23(3)(b)',
      ),
    ],
    'Any one ground (Article 23(3))',
  )
}

/**
 * The Art 3(1)(a) figure and how it was arrived at.
 */
function lossLimit(row: ComplianceRow): [number, string] {
  if (!stated(row.annualTurnoverEur)) {
    return [GENERAL_LOSS_EUR, '5% of turnover not tested \u2014 turnover not stated']
  }
  const share = Math.trunc(row.annualTurnoverEur * GENERAL_LOSS_TURNOVER_SHARE)
  if (share < GENERAL_LOSS_EUR) {
    return [share, `5% of turnover, lower than EUR ${shown(GENERAL_LOSS_EUR)}`]
  }
  return [GENERAL_LOSS_EUR, 'EUR 500 000, lower than 5% of turnover']
}

/**
 * "More than `share` of users, or more than `absolute`, whichever is lower."
 */
function userReach(
  row: ComplianceRow,
  share: number,
  absolute: number,
  article: string,
): Criterion {
  if (!stated(row.usersAffectedCount)) {
    return criterion('user_reach', 'Users affected', null, article, 'affected users not stated')
  }
  const limits = [absolute]
  if (stated(row.usersTotalCount)) limits.push(Math.trunc(row.usersTotalCount * share))
  const limit = Math.min(...limits)
  let detail = `${shown(row.usersAffectedCount)} against ${shown(limit)}`
  if (!stated(row.usersTotalCount)) {
    detail += ` (${share * 100}% of users not tested \u2014 user base not stated)`
  }
  // Strictly greater, matching `gates.threshold` and the "more than" the
  // Articles are worded in - this limb builds its own criterion rather than
  // going through that helper, so it did not inherit the correction.
  return criterion('user_reach', 'Users affected', row.usersAffectedCount > limit, article, detail)
}

/**
 * The per-type availability limbs, Articles 5-14.
 */
function availability(row: ComplianceRow): Criterion[] {
  const kind = row.nis2EntityType ?? ''
  const article = IR_ARTICLES[kind] ?? ''
  const found: Criterion[] = []

  const shareOnly = USER_SHARE_ONLY[kind]
  if (shareOnly) return [userReach(row, shareOnly[0], shareOnly[1], article)]

  const complete = COMPLETE_OUTAGE_MINUTES[kind]
  if (complete !== undefined) {
    if (!stated(row.serviceDowntimeMinutes)) {
      found.push(
        criterion('complete_outage', 'Complete unavailability', null, article, 'no downtime stated'),
      )
    } else if (!row.serviceDowntimeComplete) {
      // A degraded service is not a complete outage, and saying so is a
      // definite no rather than an unknown: the case *did* state which kind.
      found.push(
        criterion(
          'complete_outage',
          'Complete unavailability',
          false,
          article,
          'the outage was degraded service',
        ),
      )
    } else if (complete === 0) {
      found.push(
        criterion(
          'complete_outage',
          'Complete unavailability',
          true,
          article,
          'any complete outage counts',
        ),
      )
    } else {
      found.push(
        threshold(
          'complete_outage',
          'Complete unavailability',
          row.serviceDowntimeMinutes,
          complete,
          { article, unit: 'minutes' },
        ),
      )
    }
  }

  const limited = LIMITED_AVAILABILITY[kind]
  if (limited) {
    const [minutes, share, absolute] = limited
    /**
     * Only the halves the article actually has.
     */
    const parts: Criterion[] = []
    if (minutes !== null) {
      parts.push(
        threshold(
          'limited_duration',
          'Limited availability, duration',
          row.serviceDowntimeMinutes,
          minutes,
          { article, unit: 'minutes' },
        ),
      )
    }
    if (share !== null && absolute !== null) parts.push(userReach(row, share, absolute, article))
    const both = allOf(parts)
    found.push(
      criterion(
        'limited_availability',
        'Limited availability',
        both.met,
        article,
        parts
          .map((part) => part.detail)
          .filter(Boolean)
          .join('; '),
      ),
    )
  }
  return found
}

/**
 * IR Article 3(1) plus the entity's own Articles 5-14 limbs.
 */
export function quantifiedCriteria(row: ComplianceRow): Determination {
  const [limit, basis] = lossLimit(row)
  // The basis rides on the detail whether or not the loss was stated: with a
  // figure present the threshold reads as tested, and an untested 5% limb
  // behind it is invisible - which is the half that lowers a smaller entity's
  // limit.
  const loss = threshold('financial_loss', 'Direct financial loss', row.financialLossEur, limit, {
    article: 'IR Art 3(1)(a)',
    unit: 'EUR',
  })

  const criteria: Criterion[] = [
    { ...loss, detail: `${loss.detail} (${basis})` },
    ground('trade_secret', 'Trade secret exfiltration', row.nis2TradeSecretLoss, 'IR Art 3(1)(b)'),
    ground('death', 'Death of a person', row.nis2Death, 'IR Art 3(1)(c)'),
    ground('health', 'Considerable damage to health', row.nis2HealthDamage, 'IR Art 3(1)(d)'),
    {
      ...ground(
        'malicious_access',
        'Malicious unauthorised access capable of severe disruption',
        row.nis2MaliciousAccess,
        'IR Art 3(1)(e)',
      ),
      detail: 'includes pre-positioning (recital 39)',
    },
    {
      ...ground('recurring', 'Recurring incidents in six months', row.recurringIncident, 'IR Art 4'),
      detail: row.recurringEarlierCases || '',
    },
    ...availability(row),
  ]
  return anyOf(criteria, 'Any one criterion (IR Article 3(1), 5\u201314)')
}

/**
 * Criteria this entity's article carries that the case cannot answer.
 */
export function unassessedLimbs(row: ComplianceRow): readonly string[] {
  return UNSTORED_LIMBS[row.nis2EntityType ?? ''] ?? []
}

/**
 * The whole determination: in scope, and meeting the applicable test.
 */
export function significance(row: ComplianceRow): Determination {
  const scope = allOf([inScope(row)])
  const which = track(row)
  if (which === '') {
    return gate(
      [
        scope,
        allOf([
          criterion('track', 'Applicable test', null, 'IR recital 30', 'entity type not stated'),
        ]),
      ],
      'NIS2 Article 23 significance',
    )
  }
  const body = which === 'quantified' ? quantifiedCriteria(row) : qualitativeGrounds(row)
  return gate([scope, body], 'NIS2 Article 23 significance')
}

/**
 * What the analyst recorded, which always outranks the derivation.
 */
export function statedDetermination(row: ComplianceRow): string {
  return row.nis2Significance ?? ''
}

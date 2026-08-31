/**
 * NIS2 Article 23: is this a significant incident, and under which test.
 *
 * Scope gate -> determination. **Two tracks, and the entity type picks between
 * them:**
 *
 * - **Quantified** (Commission Implementing Regulation (EU) 2024/2690) for the
 *   eleven entity types it names. Recital 30 makes those criteria *exhaustive*,
 *   so a covered entity does **not** fall back to the abstract wording.
 * - **Qualitative** (Directive Article 23(3)) for every other sector. Articles
 *   21(5) and 23(11) make extension of the IR discretionary, and it was
 *   unexercised as of October 2024.
 *
 * Assessing a covered entity qualitatively, or an uncovered one against numbers
 * no instrument applies to it, is the failure this module exists to prevent.
 *
 * **Every figure here is lifted from the vendored OJ text**, never retyped -
 * a test asserting the constants against themselves cannot see a wrong limb.
 *
 * **`null` is unstated and `0` is a measurement.** A stated zero downtime
 * answers the availability limb with a definite no rather than leaving it open.
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
 *
 * An out-of-scope entity has no significant incidents however bad the incident
 * is, and an **unstated class is unknown rather than out** - most cases start
 * there, and reading silence as "not regulated" is how this section would go
 * quiet on exactly the case that needed it.
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
 *
 * Unstated is its own answer: guessing either track picks a test the entity may
 * not be subject to, and the two reach opposite verdicts on the same facts
 * routinely.
 */
export function track(row: ComplianceRow): 'quantified' | 'qualitative' | '' {
  if (!row.nis2EntityType) return ''
  return row.nis2EntityType in IR_ARTICLES ? 'quantified' : 'qualitative'
}

/**
 * Article 23(3): any one ground makes the incident significant.
 *
 * Both limbs are asserted rather than derived - the test is whether the
 * incident "has caused or is capable of causing" the harm, a judgement about a
 * counterfactual no entity table answers. An unticked box is *not stated*,
 * never a finding of no harm.
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
 *
 * **Falls back to the absolute EUR 500 000 when no turnover is stated, and says
 * so.** The percentage is the half that *lowers* a smaller entity's threshold,
 * so silently using the absolute alone reports them clear of a limit they may
 * be well over.
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
 *
 * Both halves are tested and the **lower wins**, so a small provider is not
 * reported clear because it could never reach a million users - which is what
 * testing only the absolute figure does.
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
 *
 * **Complete and limited unavailability are separate criteria with separate
 * limits**, which is why the case records which kind the outage was: one
 * duration with no kind attached answers neither, and a degraded service
 * measured against the complete-outage limit crosses it in half the time.
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
     * Only the halves the article actually has. Both present, both must hold -
     * long enough *and* reaching enough users - and the pair collapses to one
     * criterion because the outer test is a list of alternatives, where a
     * half-met conjunction would read as a met one.
     *
     * A `null` half is not a limb that passes trivially: adding one the article
     * does not contain over-reports (DNS carried a fabricated user-reach limb),
     * and requiring one it does not contain under-reports (a trust service held
     * to a duration Art 14(c) never sets).
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
 *
 * Any one criterion makes the incident significant - 3(1) is a list of
 * alternatives, not a conjunction, so an unanswered limb beside a met one is
 * not a gap.
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
 *
 * Surfaced rather than silently skipped: "not significant" is a different claim
 * from "not significant on the criteria I could test", and only one of them is
 * honest about a DNS resolution-time limb the app stores no field for.
 */
export function unassessedLimbs(row: ComplianceRow): readonly string[] {
  return UNSTORED_LIMBS[row.nis2EntityType ?? ''] ?? []
}

/**
 * The whole determination: in scope, and meeting the applicable test.
 *
 * **Undetermined rather than false whenever the track is unknown** - picking
 * one assesses the entity against an instrument that may not apply to it, and
 * both tracks reach confident opposite verdicts on the same facts.
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
 *
 * The app presents criteria and the analyst records the call; a derived verdict
 * that overrode a stated one would be the app asserting law.
 */
export function statedDetermination(row: ComplianceRow): string {
  return row.nis2Significance ?? ''
}

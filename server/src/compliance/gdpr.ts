/**
 * GDPR Articles 33 and 34: who has to be told, and by when.
 */
import { DEFAULT_POLICY, type Policy } from '../domain/compliance-policy.js'
import { GDPR_SEVERITY_BANDS } from '../domain/vocabularies/compliance.js'
import * as enisa from './enisa.js'
import {
  allOf,
  anyOf,
  criterion,
  deciding,
  gate,
  ground,
  type Criterion,
  type Determination,
} from './gates.js'
import type { ComplianceRow } from './compliance.service.js'

export { DEFAULT_POLICY, type Policy }

/** Article 33(1): notification is due within 72 hours of becoming aware. */
export const NOTIFY_AUTHORITY_HOURS = 72


/**
 * Article 4(12): is this a personal data breach at all.
 */
export function inScope(row: ComplianceRow): Criterion {
  const answer = ground('scope', 'Personal data breach', row.personalDataInvolved, 'Art 4(12)')
  return answer.met === null
    ? { ...answer, detail: 'personal data involvement not stated' }
    : { ...answer, detail: '' }
}

/**
 * The computed ENISA score, or `null` when the two required factors are not
 * both stated.
 */
export function severity(row: ComplianceRow): enisa.SeverityScore | null {
  if (!enisa.scoreable(row.gdprDataContext, row.gdprIdentifiability)) return null
  return enisa.severityScore(
    row.gdprDataContext!,
    row.gdprIdentifiability!,
    row.gdprCircumstances ?? [],
  )
}

const isStatedBand = (value: string | null): boolean =>
  value !== null && (GDPR_SEVERITY_BANDS as readonly string[]).includes(value)

/**
 * The band the obligations are read against: the analyst's if stated, otherwise
 * the computed one, otherwise `''`.
 */
export function effectiveBand(row: ComplianceRow): string {
  if (isStatedBand(row.gdprSeverityOverride)) return row.gdprSeverityOverride!
  return severity(row)?.band ?? ''
}

/**
 * "Is the severity at least `floor`", with the band and its source in the
 * detail.
 */
function bandCriterion(
  row: ComplianceRow,
  floor: string,
  key: string,
  label: string,
  article: string,
): Criterion {
  const band = effectiveBand(row)
  if (!band) {
    return criterion(
      key,
      label,
      null,
      article,
      'severity not assessed \u2014 state the data category and identifiability',
    )
  }
  const source = isStatedBand(row.gdprSeverityOverride) ? 'stated by the analyst' : 'computed (ENISA)'
  return criterion(
    key,
    label,
    enisa.atLeastBand(band, floor),
    article,
    `${band}, ${source}; threshold ${floor}`,
  )
}

/**
 * Notify the supervisory authority, unless the breach is unlikely to result in
 * a risk.
 */
export function article33(row: ComplianceRow, policy: Policy = DEFAULT_POLICY): Determination {
  return gate(
    [
      allOf([inScope(row)]),
      allOf([
        bandCriterion(row, policy.authorityFloor, 'risk', 'Risk to rights and freedoms', 'Art 33(1)'),
      ]),
    ],
    'GDPR Article 33 \u2014 notify the supervisory authority',
  )
}

/**
 * Communicate to the data subjects, unless one of 34(3)'s carve-outs applies.
 */
export function article34(row: ComplianceRow, policy: Policy = DEFAULT_POLICY): Determination {
  const rule = 'GDPR Article 34 \u2014 communicate to data subjects'
  const risk = bandCriterion(row, policy.subjectsFloor, 'high_risk', 'High risk to data subjects', 'Art 34(1)')
  const scope = allOf([inScope(row), risk])
  if (scope.met !== true) return { met: scope.met, criteria: scope.criteria, rule }

  const exemptions = anyOf(
    [
      ground('encryption', 'Data unintelligible to others', row.gdprEncryptionApplied, 'Art 34(3)(a)'),
      ground(
        'measures',
        'Subsequent measures make the high risk unlikely',
        row.gdprSubsequentMeasures,
        'Art 34(3)(b)',
      ),
      {
        ...ground(
          'public',
          'Individual notice disproportionate',
          row.gdprPublicCommunication,
          'Art 34(3)(c)',
        ),
        detail: 'a public communication is required instead',
      },
    ],
    'Any one carve-out (Article 34(3))',
  )

  if (exemptions.met === true) {
    return { met: false, criteria: [...scope.criteria, ...deciding(exemptions)], rule }
  }
  // An unclaimed carve-out is not a gap: 34(3) is an exception the controller
  // invokes, so silence means it is not being relied on and the duty stands.
  return { met: true, criteria: scope.criteria, rule }
}

/**
 * When the Article 33 notification is due, or `null` if awareness is unstated.
 */
export function deadline(row: ComplianceRow): Date | null {
  if (!row.gdprAwareAt) return null
  return new Date(row.gdprAwareAt.getTime() + NOTIFY_AUTHORITY_HOURS * 3600 * 1000)
}

/**
 * Hours left before the Article 33 deadline; negative once it has passed.
 */
export function hoursRemaining(row: ComplianceRow, now: Date = new Date()): number | null {
  const due = deadline(row)
  if (!due) return null
  return (due.getTime() - now.getTime()) / 3_600_000
}

/**
 * Whether each notification has been recorded.
 */
export function notified(row: ComplianceRow): { authority: boolean; subjects: boolean } {
  return {
    authority: Boolean(row.gdprAuthorityNotifiedAt),
    subjects: Boolean(row.gdprSubjectsNotifiedAt),
  }
}

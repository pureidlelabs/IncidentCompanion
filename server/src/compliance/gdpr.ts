/**
 * GDPR Articles 33 and 34: who has to be told, and by when.
 *
 * Scope gate -> severity -> two separate obligations -> the 72-hour clock, which
 * runs from the stated awareness time and is unknown while that is unset.
 *
 * A severity band stated on the case wins over the one `enisa.ts` derives, and
 * the band each obligation starts at is `Policy` rather than a constant.
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
 *
 * Three-valued, so *unstated* and *no personal data* are different answers: the
 * first leaves every downstream obligation undetermined, the second puts the
 * case out of scope and says so.
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
 *
 * **`null` rather than a default score**: `severityScore` throws on an unknown
 * factor deliberately, and a lens quietly passing "simple" for an unset context
 * would return a confident low band for a breach nobody has assessed.
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
 *
 * **The override is checked against the vocabulary rather than trusted** - a
 * band left by an older build or an imported archive that is not in the list
 * would otherwise reach `atLeastBand` and index at -1, which compares as *below
 * every floor* and silently reports the case clear.
 */
export function effectiveBand(row: ComplianceRow): string {
  if (isStatedBand(row.gdprSeverityOverride)) return row.gdprSeverityOverride!
  return severity(row)?.band ?? ''
}

/**
 * "Is the severity at least `floor`", with the band and its source in the
 * detail.
 *
 * The source rides along because the two are argued differently: a computed
 * band is checkable from the factors on screen, a stated one is the
 * controller's own assessment and is the thing a regulator would question.
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
 *
 * **The Regulation's default is notify**: 33(1) makes it the obligation and
 * "unlikely to result in a risk" the exception, so the criterion is phrased as
 * reaching the risk floor rather than as an exemption to be earned.
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
 * They are evaluated separately and inverted, so any one removes the duty
 * however high the risk.
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
 *
 * **The column is a timestamp**, so the parse Python needed for a stored string
 * is gone with it - and with it the "unparseable returns null" case, which was
 * about a CSV import reaching the same field.
 */
export function deadline(row: ComplianceRow): Date | null {
  if (!row.gdprAwareAt) return null
  return new Date(row.gdprAwareAt.getTime() + NOTIFY_AUTHORITY_HOURS * 3600 * 1000)
}

/**
 * Hours left before the Article 33 deadline; negative once it has passed.
 *
 * **Signed rather than clamped at zero**, so an overdue notification reads as
 * overdue instead of as due right now - the two call for different
 * conversations with the regulator.
 */
export function hoursRemaining(row: ComplianceRow, now: Date = new Date()): number | null {
  const due = deadline(row)
  if (!due) return null
  return (due.getTime() - now.getTime()) / 3_600_000
}

/**
 * Whether each notification has been recorded.
 *
 * **Separate from the determinations on purpose**: what is *owed* and what has
 * been *done* are two facts, and a lens that reported "not reportable" once the
 * notification was filed would erase the obligation it was filed under.
 */
export function notified(row: ComplianceRow): { authority: boolean; subjects: boolean } {
  return {
    authority: Boolean(row.gdprAuthorityNotifiedAt),
    subjects: Boolean(row.gdprSubjectsNotifiedAt),
  }
}

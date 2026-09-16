/**
 * Every regime this case reaches, its article, and the verdict under it.
 *
 * **Decided here and rendered nowhere.** A client gets the verdict, the limbs
 * that decided it and the citation, and owns how all three read - one
 * implementation rather than one per front end.
 *
 * In play means classified in scope, not merely "not excluded", so a fresh
 * case lists no regime. GDPR stacks orthogonally and gets two rows.
 */
import * as dora from './dora.js'
import * as gdpr from './gdpr.js'
import * as nis2 from './nis2.js'
import { deciding, type Determination } from './gates.js'
import { readiness } from './readiness.js'
import { regimesInPlay, type RegimeKey } from './regimes.js'
import type { Policy } from '../domain/compliance-policy.js'
import type { ComplianceRow } from './compliance.service.js'
import { z } from 'zod'

export const verdictCriterionSchema = z.object({
  met: z
    .boolean()
    .nullable()
    .describe('Null while the case has not recorded enough to decide.'),
  label: z.string(),
  article: z.string(),
  detail: z.string(),
})

export type VerdictCriterion = z.infer<typeof verdictCriterionSchema>

export const verdictSchema = z.object({
  regime: z.string().describe('Which regulation, for example NIS2 or DORA.'),
  article: z.string(),
  verdict: z
    .boolean()
    .nullable()
    .describe('Null means undecidable on what the case records, not "no".'),
  rule: z.string(),
  detail: z.string(),
  criteria: z.array(verdictCriterionSchema),
  readiness: z.string(),
})

export type Verdict = z.infer<typeof verdictSchema>

/**
 * **The deciding limbs, not every limb.** Rendering all of them under a verdict
 * buries the reason among a dozen inapplicable lines; the client shows what
 * carried it.
 */
function criteriaRows(determination: Determination): VerdictCriterion[] {
  return deciding(determination).map((one) => ({
    met: one.met,
    label: one.label,
    article: one.article,
    detail: one.detail || '',
  }))
}

const TRACK_DETAIL: Record<string, string> = {
  quantified: 'Implementing Regulation (EU) 2024/2690',
  qualitative: 'Directive Article 23(3)',
}

/** What a regime in play puts on the case, before the readiness line is attached. */
interface Finding {
  article: string
  determination: Determination
  detail: string
}

/**
 * **GDPR stacks orthogonally and gets two rows**, which is why a regime answers
 * with a list rather than one finding.
 */
const FINDINGS: Record<RegimeKey, (row: ComplianceRow, policy: Policy) => Finding[]> = {
  nis2: (row) => [
    {
      article: 'Article 23',
      determination: nis2.significance(row),
      detail: TRACK_DETAIL[nis2.track(row)] ?? 'entity type not stated',
    },
  ],
  gdpr: (row, policy) => {
    const band = gdpr.effectiveBand(row) || 'severity not assessed'
    return [
      {
        article: 'Article 33',
        determination: gdpr.article33(row, policy),
        detail: `supervisory authority; ${band}`,
      },
      {
        article: 'Article 34',
        determination: gdpr.article34(row, policy),
        detail: `data subjects; ${band}`,
      },
    ]
  },
  dora: (row) => [
    {
      article: 'Article 19',
      determination: dora.major(row),
      detail: 'major ICT-related incident',
    },
  ],
}

export function complianceBreakdown(
  row: ComplianceRow,
  enabled: Record<string, boolean>,
  policy: Policy,
): Verdict[] {
  const lines = new Map(readiness(row, enabled, policy).map((one) => [one.regime, one.line]))

  return regimesInPlay(row, enabled).flatMap((regime) =>
    FINDINGS[regime.key](row, policy).map((finding) => ({
      regime: regime.label,
      article: finding.article,
      verdict: finding.determination.met,
      rule: finding.determination.rule,
      detail: finding.detail,
      criteria: criteriaRows(finding.determination),
      readiness: lines.get(regime.key) ?? '',
    })),
  )
}

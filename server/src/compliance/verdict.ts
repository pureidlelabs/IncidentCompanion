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

export function complianceBreakdown(
  row: ComplianceRow,
  enabled: Record<string, boolean>,
  policy: Policy,
): Verdict[] {
  const lines = new Map(readiness(row, enabled, policy).map((one) => [one.regime, one.line]))
  const rows: Verdict[] = []

  const add = (regime: string, article: string, determination: Determination, detail: string) => {
    rows.push({
      regime,
      article,
      verdict: determination.met,
      rule: determination.rule,
      detail,
      criteria: criteriaRows(determination),
      readiness: lines.get(regime.toLowerCase()) ?? '',
    })
  }

  if (enabled.nis2 && (row.nis2EntityClass === 'essential' || row.nis2EntityClass === 'important')) {
    add(
      'NIS2',
      'Article 23',
      nis2.significance(row),
      TRACK_DETAIL[nis2.track(row)] ?? 'entity type not stated',
    )
  }

  if (enabled.gdpr && row.personalDataInvolved === 'yes') {
    const band = gdpr.effectiveBand(row) || 'severity not assessed'
    add('GDPR', 'Article 33', gdpr.article33(row, policy), `supervisory authority; ${band}`)
    add('GDPR', 'Article 34', gdpr.article34(row, policy), `data subjects; ${band}`)
  }

  // Shown once the criticality gate has any answer at all: before that the row
  // says "undetermined" on every case the app opens.
  if (enabled.dora && dora.inScope(row).met !== null) {
    add('DORA', 'Article 19', dora.major(row), 'major ICT-related incident')
  }

  return rows
}

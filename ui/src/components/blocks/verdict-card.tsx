import type { ReactNode } from 'react'

import type { ComplianceVerdict } from '@/api/compliance'
import { Badge } from '@/components/ui/badge'

/**
 * One regime's answer on this case, and what it was reached from.
 */
export function VerdictCard({ verdict }: { verdict: ComplianceVerdict }) {
  return (
    <div data-slot="compliance-verdict" className="rounded-md border border-border px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">{`${verdict.regime} ${verdict.article}`}</span>
        <VerdictChip verdict={verdict.verdict} />
      </div>
      {verdict.detail !== '' && <p className="mt-1 text-xs text-ink-muted">{verdict.detail}</p>}
      {verdict.criteria.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 pl-4 text-xs">
          {verdict.criteria.map((criterion) => (
            <li key={criterion.label} className="flex gap-2">
              <span aria-hidden className="shrink-0 font-mono">
                {criterion.met === true ? 'y' : criterion.met === false ? 'n' : '?'}
              </span>
              <span className="sr-only">{markWord(criterion.met)}</span>
              <span>{`${criterion.label} (${criterion.article}) \u2014 ${criterion.detail}`}</span>
            </li>
          ))}
        </ul>
      )}
      {verdict.readiness !== '' && (
        <p className="mt-2 text-xs text-ink-muted">{verdict.readiness}</p>
      )}
    </div>
  )
}

/** What the letter beside a criterion says, for anything that cannot see it. */
function markWord(met: boolean | null): string {
  return met === true ? 'met: ' : met === false ? 'not met: ' : 'undetermined: '
}

/**
 * The verdict itself.
 */
export function VerdictChip({ verdict }: { verdict: boolean | null }): ReactNode {
  if (verdict === null) return <Badge variant="outlined">Undetermined</Badge>
  if (verdict) {
    return (
      <Badge variant="solid" className="bg-severity-critical text-on-severity">
        Reportable
      </Badge>
    )
  }
  return <Badge variant="soft">Not reportable</Badge>
}

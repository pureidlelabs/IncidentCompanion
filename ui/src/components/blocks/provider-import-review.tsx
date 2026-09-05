import { useMemo } from 'react'

import { EmptyState } from '@/components/blocks/empty-state'
import { Badge } from '@/components/ui/badge'

/** What one incident would add to the case, as the server computed it. */
export interface Candidate {
  id: string
  /** The incident this came from. */
  incident: string
  /** Which table the row would land in. */
  collection: string
  label: string
  /** `new` writes a row; `merge` updates one the case already holds. */
  verdict: 'new' | 'merge'
  /** How many fields the row carries. */
  fields: number
}

/** A count and its noun, inflected. `1 merge`, `0 merges`, `3 merges`. */
function count(many: number, noun: string): string {
  return `${String(many)} ${noun}${many === 1 ? '' : 's'}`
}

/**
 * What the import would write, grouped by the incident it came from.
 *
 * **`new` writes a row and `merge` updates one the case already holds**, and
 * the two are the whole of what a reviewer is deciding between - so the verdict
 * is a chip on every row rather than a count at the top.
 */
export function ProviderImportReview({ candidates }: { candidates: readonly Candidate[] }) {
  const byIncident = useMemo(() => {
    const order: string[] = []
    const found = new Map<string, Candidate[]>()
    for (const one of candidates) {
      if (!found.has(one.incident)) {
        found.set(one.incident, [])
        order.push(one.incident)
      }
      found.get(one.incident)?.push(one)
    }
    return order.map((incident) => ({ incident, rows: found.get(incident) ?? [] }))
  }, [candidates])

  if (candidates.length === 0) {
    return (
      <EmptyState
        title="Nothing to add"
        detail="Every row these incidents carry is already in the case, unchanged."
      />
    )
  }

  const fresh = candidates.filter((one) => one.verdict === 'new').length

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted" role="status">
        {`${count(fresh, 'new row')} and ${count(candidates.length - fresh, 'merge')}, from ${count(byIncident.length, 'incident')}.`}
      </p>

      {byIncident.map(({ incident, rows }) => (
        <div key={incident} className="flex flex-col gap-1.5">
          <h3 className="font-mono text-xs text-ink-muted">{incident}</h3>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Badge variant="outlined" size="xs">
                  {row.collection}
                </Badge>
                <span className="min-w-0 flex-1 truncate" title={row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 text-2xs text-ink-muted tabular-nums">
                  {`${String(row.fields)} fields`}
                </span>
                <Badge variant="soft" size="xs">
                  {row.verdict}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

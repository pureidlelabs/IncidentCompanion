import { useEffect, useMemo } from 'react'

import {
  DataTable,
  selectionColumn,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { EmptyState } from '@/components/blocks/empty-state'
import { Badge } from '@/components/ui/badge'

/** What one incident would add to the case, as the server computed it. */
export interface Candidate {
  id: string
  incident: string
  collection: string
  label: string
  /** `new` writes a row; `merge` updates one the case already holds. */
  verdict: 'new' | 'merge'
  fields: number
  /**
   * Whether the server proposed writing this one.
   *
   * **The server has an opinion and it is not always yes**: a row the case
   * already holds and a network indicator on a private address both arrive
   * unticked. -> `providers/sentinel/mapping.ts`
   */
  checked: boolean
}

/** A count and its noun, inflected. `1 merge`, `0 merges`, `3 merges`. */
function count(many: number, noun: string): string {
  return `${String(many)} ${noun}${many === 1 ? '' : 's'}`
}

/**
 * What the import would write, with every row approvable on its own.
 *
 * Every row the import would write is listed, entity and timeline alike.
 * **Ticked is approved**, and the ticks start where the server put them --
 * each candidate's own `checked`. `new` writes a row and `merge` updates one
 * the case already holds, so the verdict is a chip on every row rather than a
 * count at the top. -> `openspec/specs/incident-import`
 */
export function ProviderImportReview({
  candidates,
  onApproved,
}: {
  candidates: readonly Candidate[]
  /** The rows still ticked. Called on the first draw and on every change. */
  onApproved: (ids: readonly string[]) => void
}) {
  if (candidates.length === 0) {
    return (
      <EmptyState
        title="Nothing to add"
        detail="Every row these incidents carry is already in the case, unchanged."
      />
    )
  }

  return <ReviewTable candidates={candidates} onApproved={onApproved} />
}

/**
 * The proposal, on the app's own table.
 *
 * Separated from the empty branch above because the hooks below cannot be
 * called conditionally, and reported up as a sorted key rather than the row
 * model's own array: that array is fresh on every render, so depending on it
 * reports upward on each pass, which is a loop through the parent's state.
 */
function ReviewTable({
  candidates,
  onApproved,
}: {
  candidates: readonly Candidate[]
  onApproved: (ids: readonly string[]) => void
}) {
  const columns = useMemo(() => reviewColumns(), [])
  // Read once by the table, so the identity of this object does not matter
  // after the first draw -- and a decline must survive the next render.
  const proposed = useMemo<Record<string, true>>(
    () =>
      Object.fromEntries(
        candidates.filter((one) => one.checked).map((one) => [one.id, true as const]),
      ),
    [candidates],
  )
  const table = useEntityTable<Candidate>({
    data: candidates as Candidate[],
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
    initialSelection: proposed,
  })

  const ticked = JSON.stringify(
    table
      .getSelectedRowModel()
      .rows.map((row) => row.id)
      .sort(),
  )
  useEffect(() => {
    onApproved(JSON.parse(ticked) as string[])
  }, [ticked, onApproved])

  const approved = (JSON.parse(ticked) as string[]).length
  const fresh = candidates.filter((one) => one.verdict === 'new').length
  const incidents = new Set(candidates.map((one) => one.incident)).size

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-sm text-ink-muted" role="status">
        {`${count(fresh, 'new row')} and ${count(candidates.length - fresh, 'merge')}, from ${count(incidents, 'incident')}. ${count(approved, 'row')} approved.`}
      </p>

      <DataTable table={table} label="Rows this import would write" scroll="box" />
    </div>
  )
}

/** The proposal's columns. The label is the only width-less one. */
function reviewColumns(): EntityColumn<Candidate>[] {
  return [
    selectionColumn<Candidate>((row) => `Import ${row.label}`),
    {
      accessorKey: 'incident',
      header: 'Incident',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block truncate font-mono text-data">{row.original.incident}</span>
      ),
    },
    {
      accessorKey: 'collection',
      header: 'Table',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant="outlined" size="xs">
          {row.original.collection}
        </Badge>
      ),
    },
    {
      accessorKey: 'label',
      header: 'Row',
      enableSorting: false,
      meta: { className: 'font-medium' },
      cell: ({ row }) => (
        <span className="block truncate" title={row.original.label}>
          {row.original.label}
        </span>
      ),
    },
    {
      accessorKey: 'fields',
      header: 'Fields',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-ink-muted tabular-nums">{String(row.original.fields)}</span>
      ),
    },
    {
      accessorKey: 'verdict',
      header: 'Verdict',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant="soft" size="xs">
          {row.original.verdict}
        </Badge>
      ),
    },
  ]
}

import { useEffect, useMemo } from 'react'

import {
  DataTable,
  selectionColumn,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { EmptyState } from '@/components/blocks/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ListBoxItem } from '@/components/ui/list-box'
import { Select } from '@/components/ui/select'
import { TextField } from '@/components/ui/text-field'

/** One incident as a provider serves it. */
export interface RemoteIncident {
  id: string
  /** What the provider counts it as, and the only thing an ID filter matches. */
  number: string
  title: string
  severity: string
  status: string
  /** When the provider raised it, in the provider's own format. */
  created: string
}

/** What the five dials ask the provider for. */
export interface Dials {
  severity: string
  status: string
  /** Hours back, as a string because that is what the select carries. */
  sinceHours: string
  title: string
  number: string
}

export const SEVERITIES = ['Any', 'High', 'Medium', 'Low', 'Informational'] as const
export const STATUSES = ['Any', 'New', 'Active', 'Closed'] as const

/** The window the listing covers. `0` is any time. */
export const WINDOWS: readonly { value: number; label: string }[] = [
  { value: 24, label: 'Last 24 hours' },
  { value: 168, label: 'Last 7 days' },
  { value: 720, label: 'Last 30 days' },
  { value: 0, label: 'Any time' },
]

export const NO_DIALS: Dials = {
  severity: 'Any',
  status: 'Any',
  sinceHours: '168',
  title: '',
  number: '',
}

/** Which incidents to pull, and the five dials that compose the query. */
export function ProviderIncidentPicker({
  incidents,
  total,
  dials,
  onDials,
  warning,
  onSearch,
  selected,
  onSelected,
}: {
  incidents: readonly RemoteIncident[]
  total: number
  dials: Dials
  onDials: (next: Dials) => void
  warning: string
  onSearch: () => void
  selected: readonly string[]
  onSelected: (next: readonly string[]) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Severity"
          className="w-40"
          selectedKey={dials.severity}
          onSelectionChange={(key) => {
            onDials({ ...dials, severity: String(key) })
          }}
        >
          {SEVERITIES.map((one) => (
            <ListBoxItem key={one} id={one}>
              {one}
            </ListBoxItem>
          ))}
        </Select>
        <Select
          label="Status"
          className="w-40"
          selectedKey={dials.status}
          onSelectionChange={(key) => {
            onDials({ ...dials, status: String(key) })
          }}
        >
          {STATUSES.map((one) => (
            <ListBoxItem key={one} id={one}>
              {one}
            </ListBoxItem>
          ))}
        </Select>
        <Select
          label="Opened"
          className="w-44"
          selectedKey={dials.sinceHours}
          onSelectionChange={(key) => {
            onDials({ ...dials, sinceHours: String(key) })
          }}
        >
          {WINDOWS.map((one) => (
            <ListBoxItem key={one.value} id={String(one.value)}>
              {one.label}
            </ListBoxItem>
          ))}
        </Select>
        <TextField
          label="Title"
          className="w-56"
          value={dials.title}
          onChange={(next) => {
            onDials({ ...dials, title: next })
          }}
        />
        {/* **The refusal is reserved only when there is one.** The row is
            `items-end`, so a field that always keeps a line for its message
            stands 20px taller than its neighbours and drags its own label up
            with it. */}
        <TextField
          label="Incident ID"
          className="w-40"
          value={dials.number}
          onChange={(next) => {
            onDials({ ...dials, number: next })
          }}
          {...(warning ? { isInvalid: true, errorMessage: warning } : {})}
        />
        {/* Control height, not `sm`: bottom-aligned against default-height
            inputs a small button sits below the row it belongs to. */}
        <Button variant="outline" onPress={onSearch}>
          Search
        </Button>
      </div>

      <p className="text-xs text-ink-muted" role="status">
        {`${String(incidents.length)} of ${String(total)} incident(s), ${String(selected.length)} selected.`}
      </p>

      <IncidentTable incidents={incidents} onSelected={onSelected} />
    </div>
  )
}

/**
 * The listing, on the app's own table.
 */
function IncidentTable({
  incidents,
  onSelected,
}: {
  incidents: readonly RemoteIncident[]
  onSelected: (next: readonly string[]) => void
}) {
  const columns = useMemo(() => incidentColumns(), [])
  const table = useEntityTable<RemoteIncident>({
    data: incidents as RemoteIncident[],
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
    // Newest first, which is the shift an analyst comes in on.
    initialSorting: [{ id: 'created', desc: true }],
  })

  const ticked = JSON.stringify(
    table
      .getSelectedRowModel()
      .rows.map((row) => row.id)
      .sort(),
  )
  useEffect(() => {
    onSelected(JSON.parse(ticked) as string[])
  }, [ticked, onSelected])

  return (
    <DataTable
      table={table}
      label="Incidents this workspace holds"
      scroll="box"
      empty={
        <EmptyState
          title="Nothing in that window"
          detail="Widen the window, or drop the severity and status dials."
        />
      }
    />
  )
}

/** The listing's columns. The title is the only width-less one. */
function incidentColumns(): EntityColumn<RemoteIncident>[] {
  return [
    selectionColumn<RemoteIncident>((row) => `Import incident ${row.id}`),
    {
      accessorKey: 'id',
      header: 'Incident',
      enableSorting: false,
      meta: { className: 'w-[16%]' },
      cell: ({ row }) => (
        <span className="block truncate font-mono text-data">{row.original.id}</span>
      ),
    },
    {
      accessorKey: 'title',
      header: 'Title',
      enableSorting: false,
      meta: { className: 'font-medium' },
      cell: ({ row }) => (
        <span className="block truncate" title={row.original.title}>
          {row.original.title}
        </span>
      ),
    },
    {
      accessorKey: 'severity',
      header: 'Severity',
      enableSorting: false,
      meta: { className: 'w-[14%]' },
      cell: ({ row }) => (
        <Badge variant="soft" size="xs">
          {row.original.severity}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: false,
      meta: { className: 'w-[12%]' },
      cell: ({ row }) => <span className="text-ink-muted">{row.original.status}</span>,
    },
    {
      accessorKey: 'created',
      header: 'Created',
      meta: { className: 'w-[20%]' },
      cell: ({ row }) => (
        <span className="text-ink-muted tabular-nums">{row.original.created}</span>
      ),
    },
  ]
}

import { ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'

import { matchesWords } from '@/lib/word-match'
import { PAGE_SIZE, RANGES, type RangeKey } from '@/api/installActivity'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/blocks/presence'
import { ListBoxItem } from '@/components/ui/list-box'
import { Select } from '@/components/ui/select'
import { TablePager } from '@/components/ui/table-pager'

import { DataTable, useEntityTable, type EntityColumn } from './data-table'
import { EmptyState } from './empty-state'
import { TONE_INK, toneFor, type FieldTone } from './severity-tones'
import type { FilterSet } from './filter-set'
import { FilterControls } from './filter-controls'
import { CountMeta } from './section-head'
import { Section } from './section'
import { TableToolbar } from './table-toolbar'

/** One line in an installation's own log. */
export interface AuditRow {
  id: string
  /** ISO, UTC. */
  at: string
  severity: 'Fatal' | 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational'
  /** The analyst's word for what happened. */
  activity: string
  channel: 'authentication' | 'administration' | 'case' | 'operations'
  outcome: 'Success' | 'Failure' | 'Unknown'
  /** Absent when nobody was signed in. */
  actor: string | null
  target: string | null
  source: string | null
  /** What the line's writer recorded about it. Empty when it recorded none. */
  attributes: Readonly<Record<string, string>>
  /** Whether the run this row stands for held more than one `attributes`. */
  detailsVary: boolean
  /** How many identical lines this one stands for. */
  runLength: number
}

export const LOG_LABEL: Readonly<Record<AuditRow['channel'], string>> = {
  authentication: 'Sign-in',
  administration: 'Accounts',
  case: 'Cases',
  operations: 'Installation',
}

/**
 * Whether a log line matches what is typed in the activity log's search box.
 *
 * **The Activity column and nothing else.** The person who initiated it, what
 * it acted on and the address it came from are three columns beside it and
 * are not searched.
 */
export function matchesActivity(row: AuditRow, query: string): boolean {
  return matchesWords(row.activity, query)
}

/**
 * What the Detail column says for a line, or `null` when it has nothing to say.
 *
 * **A run whose lines disagree says so rather than naming one of them.** The
 * page reports the head of a run, so a value drawn from it reads as every
 * line's -- and a run collapses lines that already agree on everything a
 * reader can filter by, which leaves what was recorded as the thing they can
 * differ on. Where they did, the values are on the API and with a collector.
 *
 * **Said of the run, never of a field.** `detailsVary` is one flag over the
 * whole record, so naming a key beside it would claim about that key what was
 * only established about the record.
 */
export function detailSummary(row: Pick<AuditRow, 'attributes' | 'detailsVary'>): string | null {
  if (row.detailsVary) return 'varies'

  const pairs = Object.entries(row.attributes)
  return pairs.length === 0 ? null : pairs.map(([key, value]) => `${key}: ${value}`).join(', ')
}


/** The floors a chip row offers. A scale, so each names everything above it. */
export const FLOORS = ['Low', 'Medium', 'High', 'Critical'] as const

/**
 * An OCSF severity as a tone on the product's ramp. Declared rather than handed
 * to `toneFor`, which answers `none` for `Fatal`.
 */
export function toneForAudit(severity: AuditRow['severity']): FieldTone {
  // Above critical on OCSF's scale, and the ramp has no step above it.
  return severity === 'Fatal' ? 'critical' : toneFor(severity)
}


/**
 * What the pane asked for and how to change it.
 *
 * The range, the chips and the page are the server's questions, so they are
 * decided where the request is made. This block draws them and reports a
 * press. -> #663
 */
export interface ActivityReading {
  range: RangeKey
  onRange: (next: RangeKey) => void
  /** Built by the pane from the counts the page carries, not from its rows. */
  filters: FilterSet
  pageNumber: number
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
  /** Every line the filters admit, which is more than this page holds. */
  total: number
}

export interface ActivityLogProps {
  audit: readonly AuditRow[]
  reading: ActivityReading
}

const DEFAULT_RANGE: RangeKey = '7d'

export function ActivityLog({ audit, reading }: ActivityLogProps) {
  const { range, onRange, filters, total } = reading
  // The one filter with no server-side form: a text search over the Activity
  // column, which narrows the page rather than the table, and says so.
  const [query, setQuery] = useState('')

  // Only the free-text search narrows here now; the chips and the range are
  // the pane's questions and the server has already answered them.
  const rows = useMemo(() => audit.filter((one) => matchesActivity(one, query)), [audit, query])

  const columns = useMemo(() => auditColumns(), [])
  const table = useEntityTable<AuditRow>({
    data: rows,
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
  })

  // The range narrows like everything else here, so an empty result after
  // changing it says which empty it is, and one control undoes all of them.
  const narrowed = filters.narrowed || query.trim() !== '' || range !== DEFAULT_RANGE
  const clear = () => {
    filters.clear()
    setQuery('')
    onRange(DEFAULT_RANGE)
  }

  return (
    <Section
      title="Activity"
      meta={total === 0 ? undefined : <CountMeta total={total} noun="event" />}
      toolbar={
        <TableToolbar
          searchColumn="Activity"
          placeholder="What happened"
          value={query}
          onValue={setQuery}
          applied={filters.applied}
          narrowed={narrowed}
          onClear={clear}
          filters={<FilterControls {...filters.controls} />}
          lead={
            <Select
              aria-label="How far back"
              className="w-36"
              selectedKey={range}
              onSelectionChange={(next) => {
                onRange(next as RangeKey)
              }}
              items={RANGES.map((one) => ({ id: one.key, label: one.label }))}
            >
              {(one: { id: string; label: string }) => (
                <ListBoxItem id={one.id}>{one.label}</ListBoxItem>
              )}
            </Select>
          }
        />
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <TablePager
            pageNumber={reading.pageNumber}
            firstRow={(reading.pageNumber - 1) * PAGE_SIZE + 1}
            showing={rows.length}
            total={total}
            hasPrevious={reading.hasPrevious}
            hasNext={reading.hasNext}
            onPrevious={reading.onPrevious}
            onNext={reading.onNext}
          />
        </div>
      }
    >
      <DataTable
        table={table}
        label="What this installation has done"
        scroll="page"
        empty={
          <EmptyState
            icon={ScrollText}
            title={narrowed ? 'Nothing matches those filters' : 'Nothing recorded yet'}
            detail={
              narrowed
                ? undefined
                : 'Sign-ins, account changes and changes to this installation are recorded here as they happen.'
            }
            action={
              narrowed ? (
                <Button variant="outline" onPress={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        }
      />
    </Section>
  )
}

/**
 * The log's columns.
 *
 * **Four columns carry no width**, so `table-fixed` splits the remainder
 * between the person, what they acted on, what was recorded and where from -
 * the four that vary most in length and are read as a sentence.
 */
function auditColumns(): EntityColumn<AuditRow>[] {
  return [
    {
      accessorKey: 'at',
      header: 'Timestamp',
      meta: { className: 'w-36' },
      cell: ({ row: one }) => (
        <span className="whitespace-nowrap font-mono text-data text-ink-muted">
          {one.original.at.slice(8, 10)} {monthOf(one.original.at)} {one.original.at.slice(11, 16)}
        </span>
      ),
    },
    {
      accessorKey: 'severity',
      header: 'Severity',
      meta: { className: 'w-28' },
      cell: ({ row: one }) => (
        <span className={`inline-flex items-center gap-1.5 text-xs ${TONE_INK[toneForAudit(one.original.severity)]}`}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
          {one.original.severity}
        </span>
      ),
    },
    {
      accessorKey: 'activity',
      header: 'Activity',
      meta: { className: 'w-56' },
      cell: ({ row: one }) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{one.original.activity}</span>
          {one.original.runLength > 1 && (
            <span className="shrink-0 font-mono text-micro text-ink-muted">
              &times;{one.original.runLength}
            </span>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'channel',
      header: 'Log',
      meta: { className: 'w-28' },
      cell: ({ row: one }) => (
        <Badge variant="soft" size="sm" uppercase={false}>
          {LOG_LABEL[one.original.channel]}
        </Badge>
      ),
    },
    {
      accessorKey: 'outcome',
      header: 'Outcome',
      // Pinned rather than shared: the outcome is one of two words, so a
      // column sized to its values would take surplus it has no use for.
      meta: { className: 'w-28' },
      cell: ({ row: one }) => (
        <span
          className={
            one.original.outcome === 'Failure' ? 'text-destructive' : 'text-ink-muted'
          }
        >
          {one.original.outcome}
        </span>
      ),
    },
    {
      accessorKey: 'actor',
      header: 'Initiated by',
      cell: ({ row: one }) =>
        one.original.actor === null ? (
          <span className="text-ink-muted">Not signed in</span>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <PersonAvatar
              person={{ name: one.original.actor, you: false }}
              className="size-6 text-2xs"
            />
            <span className="truncate">{one.original.actor}</span>
          </span>
        ),
    },
    {
      accessorKey: 'target',
      header: 'Target',
      cell: ({ row: one }) =>
        one.original.target === null ? (
          <span className="text-ink-muted">&ndash;</span>
        ) : (
          <span className="block truncate">{one.original.target}</span>
        ),
    },
    {
      id: 'detail',
      header: 'Detail',
      cell: ({ row: one }) => {
        const summary = detailSummary(one.original)
        return summary === null ? (
          <span className="text-ink-muted">&ndash;</span>
        ) : (
          // The column is narrow and the values are long, so the whole of it
          // is on the element a pointer rests on.
          <span className="block truncate" title={summary}>
            {summary}
          </span>
        )
      },
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row: one }) =>
        one.original.source === null ? (
          <span className="text-ink-muted">&ndash;</span>
        ) : (
          <span className="block truncate font-mono text-data">{one.original.source}</span>
        ),
    },
  ]
}

/** The month a stamp falls in, three letters, without asking the locale. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthOf(stamp: string): string {
  return MONTHS[Number(stamp.slice(5, 7)) - 1] ?? '???'
}

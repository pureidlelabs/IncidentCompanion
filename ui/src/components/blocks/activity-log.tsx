import { ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'

import { matchesWords } from '@/lib/word-match'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/blocks/presence'
import { DateTimeInput } from '@/components/ui/datetime-input'
import { ListBoxItem } from '@/components/ui/list-box'
import { Select } from '@/components/ui/select'
import { TablePager } from '@/components/ui/table-pager'

import { DataTable, useEntityTable, type EntityColumn } from './data-table'
import { EmptyState } from './empty-state'
import { useFilters } from './filter-set'
import { FilterControls } from './filter-controls'
import { CountBadge } from './section-head'
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
  /** How many identical lines this one stands for. */
  runLength: number
}

/** What each log is called on screen. */
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
 * How far back the log is read, and how far back that is in hours.
 *
 * `All` and `Custom` name no span of their own: the first applies no lower
 * bound, and the second takes its bounds from the pair of inputs it reveals.
 */
const RANGES = [
  { id: '1 hour', hours: 1 },
  { id: '24 hours', hours: 24 },
  { id: '7 days', hours: 24 * 7 },
  { id: '30 days', hours: 24 * 30 },
  { id: 'All', hours: undefined },
  { id: 'Custom', hours: undefined },
] as const

type RangeId = (typeof RANGES)[number]['id']

/** How many lines a page draws. */
const PAGE_SIZES = [25, 50, 100, 200] as const

/** The severity floors, weakest first. */
const FLOORS = ['Low', 'Medium', 'High', 'Critical'] as const

/** Whether the line records something that worked. */
const OUTCOMES = ['Failure', 'Success'] as const

/** Where severity gets its ink, so a word and a colour say the same thing. */
const SEVERITY_INK: Readonly<Record<AuditRow['severity'], string>> = {
  Fatal: 'text-severity-high',
  Critical: 'text-severity-high',
  High: 'text-severity-high',
  Medium: 'text-severity-medium',
  Low: 'text-severity-low',
  Informational: 'text-ink-muted',
}

/** How high each severity sits, for a floor to cut against. */
const SEVERITY_RANK: Readonly<Record<AuditRow['severity'], number>> = {
  Informational: 0,
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
  Fatal: 5,
}

/**
 * What an installation has been asked to do, and what came of it: a date
 * range, a search-and-filter toolbar, the log table, and its pager.
 */
export interface ActivityLogProps {
  audit: readonly AuditRow[]
  /**
   * Milliseconds, for the range the log is read over.
   *
   * Passed in rather than read here, so a preset resolves to the same bound on
   * every run. -> `ActivityFeed`, which takes it for the same reason.
   */
  now: number
}

export function ActivityLog({ audit, now }: ActivityLogProps) {
  const [range, setRange] = useState<RangeId>('7 days')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [size, setSize] = useState<number>(25)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')

  const filters = useFilters([
    {
      key: 'log',
      label: 'Log',
      mode: 'one',
      options: (Object.keys(LOG_LABEL) as AuditRow['channel'][]).map((channel) => ({
        value: channel,
        label: LOG_LABEL[channel],
        count: audit.filter((one) => one.channel === channel).length,
      })),
    },
    {
      key: 'floor',
      label: 'Severity',
      mode: 'one',
      options: FLOORS.map((name) => ({
        value: name,
        // Cumulative: a floor names everything at or above it, so the count
        // has to as well or the chip reads as a filter that would empty the
        // table.
        count: audit.filter((one) => SEVERITY_RANK[one.severity] >= SEVERITY_RANK[name]).length,
      })),
    },
    {
      key: 'outcome',
      label: 'Outcome',
      options: OUTCOMES.map((name) => ({
        value: name,
        count: audit.filter((one) => one.outcome === name).length,
      })),
    },
  ])
  const log = (filters.one('log') ?? 'all') as AuditRow['channel'] | 'all'
  const floor = filters.one('floor') as (typeof FLOORS)[number] | undefined
  const outcome = filters.chosen('outcome')

  /**
   * The window a line has to fall inside, as two millisecond bounds.
   *
   * A preset is `now` less its own span and no upper bound. `Custom` takes
   * whichever of its two inputs is filled, so a half-filled pair is still a
   * bound rather than nothing.
   */
  const window = useMemo(() => {
    if (range === 'Custom') {
      return {
        after: from === '' ? undefined : Date.parse(from),
        before: to === '' ? undefined : Date.parse(to),
      }
    }
    const hours = RANGES.find((one) => one.id === range)?.hours
    return { after: hours === undefined ? undefined : now - hours * 3_600_000, before: undefined }
  }, [range, from, to, now])

  const rows = useMemo(
    () =>
      audit.filter((one) => {
        const at = Date.parse(one.at)
        if (window.after !== undefined && at < window.after) return false
        if (window.before !== undefined && at > window.before) return false
        if (log !== 'all' && one.channel !== log) return false
        if (floor !== undefined && SEVERITY_RANK[one.severity] < SEVERITY_RANK[floor]) return false
        if (outcome.length > 0 && !outcome.includes(one.outcome)) return false
        return matchesActivity(one, query)
      }),
    [audit, window, log, floor, outcome, query],
  )

  /**
   * The page, clamped rather than remembered.
   *
   * Narrowing the list under a reader standing on page 4 would leave them on a
   * page beyond the end, where an empty table is indistinguishable from a
   * filter that matched nothing.
   */
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const here = Math.min(page, pages)
  const shown = rows.slice((here - 1) * size, here * size)

  const columns = useMemo(() => auditColumns(), [])
  const table = useEntityTable<AuditRow>({
    data: shown,
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
  })

  // The range narrows like everything else here, so an empty result after
  // changing it says which empty it is, and one control undoes all of them.
  const narrowed = filters.narrowed || query.trim() !== '' || range !== '7 days'
  const clear = () => {
    filters.clear()
    setQuery('')
    setRange('7 days')
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <Section
      title="Activity"
      meta={audit.length === 0 ? undefined : <CountBadge total={audit.length} noun="event" />}
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
            <>
              <Select
                aria-label="How far back"
                className="w-36"
                selectedKey={range}
                onSelectionChange={(next) => {
                  setRange(next as RangeId)
                  setPage(1)
                }}
                items={RANGES.map((one) => ({ id: one.id }))}
              >
                {(one: { id: string }) => <ListBoxItem id={one.id}>{one.id}</ListBoxItem>}
              </Select>

              {/* Revealed rather than always drawn: two datetime pairs are the
                  widest thing on this row, and they mean nothing under a preset. */}
              {range === 'Custom' && (
                <>
                  <DateTimeInput
                    label="From"
                    value={from}
                    onChange={(iso) => {
                      setFrom(iso)
                      setPage(1)
                    }}
                  />
                  <DateTimeInput
                    label="To"
                    value={to}
                    onChange={(iso) => {
                      setTo(iso)
                      setPage(1)
                    }}
                  />
                </>
              )}
            </>
          }
        />
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select
            aria-label="Lines per page"
            className="w-32"
            selectedKey={String(size)}
            onSelectionChange={(next) => {
              setSize(Number(next))
              setPage(1)
            }}
            items={PAGE_SIZES.map((one) => ({ id: String(one) }))}
          >
            {(one: { id: string }) => <ListBoxItem id={one.id}>{one.id} per page</ListBoxItem>}
          </Select>

          <TablePager
            pageNumber={here}
            firstRow={(here - 1) * size + 1}
            showing={shown.length}
            total={rows.length}
            hasPrevious={here > 1}
            hasNext={here < pages}
            onPrevious={() => {
              setPage(here - 1)
            }}
            onNext={() => {
              setPage(here + 1)
            }}
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
 * **Three columns carry no width**, so `table-fixed` splits the remainder
 * between the person, what they acted on and where from - the three that vary
 * most in length and are read as a sentence.
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
        <span className={`inline-flex items-center gap-1.5 text-xs ${SEVERITY_INK[one.original.severity]}`}>
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
      // w-28: `OUTCOME` in the header's uppercase micro tier does not fit 96px,
      // and a clipped *header* is worse than a clipped cell - it is the word
      // the column is read by.
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

import { Download, Share2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { sectionPathFor } from '@/api/entityTargets'
import type { Case } from '@/api/model'
import type { Specs } from '@/api/specs'
import { Collection } from '@/components/blocks/collection'
import { useEntityTable, type EntityColumn } from '@/components/blocks/data-table'
import { useFilters } from '@/components/blocks/filter-set'
import { FieldToneBadge } from '@/components/blocks/severity-badge'
import { TlpChip } from '@/components/blocks/tlp-chip'
import { ButtonLink } from '@/components/ui/button'
import { Link } from '@/components/ui/link'
import { ListBoxItem } from '@/components/ui/list-box'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/cn'

import {
  actionableCount,
  collectIndicators,
  isActionable,
  indicatorsCsv,
  indicatorsStix,
  matchesIndicator,
  nothingToPush,
  type Indicator,
} from './indicator-rows'

/**
 * What a blocklist, a TIP or a detection stack would receive from this case.
 *
 * Nothing here is stored: every row is derived from the network indicators, the
 * malware digests and the cloud apps the case already holds, so the table is a
 * preview of the export rather than an editable surface. The export row is the
 * section's footer, so it stays pinned while a long list scrolls under it.
 *
 * **CSV leaves from here; the bundle does not.** The rows are derived in the
 * browser, so the file is built in the browser and handed over on a real
 * `<a download>` - the marking and the filters both reach it, because it is
 * built from what is on screen. A STIX bundle is assembled by the export
 * route, which this tier has none of, so that control is drawn disabled and
 * says so rather than producing a file that would not be the one the app
 * ships.
 */
export interface IndicatorsScreenProps {
  kase: Case | undefined
  specs: Specs | undefined
  /** What the search box opens with. */
  search?: string
  /**
   * The case is still being read.
   *
   * Nothing is drawn while this holds: a read that has not returned is not
   * an answer, and an ungated pending state derives indicators from another case.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

/** The column the search box names, and the heading it has to match. */
const VALUE_COLUMN = 'Value'

/**
 * The markings the export route has, and the level it defaults to.
 *
 * The route marks a bundle only when `tlp` is on the query, so an absent
 * default ships unmarked bundles rather than restrictive ones.
 */
const TLP_LEVELS = ['clear', 'white', 'green', 'amber', 'red'] as const
const DEFAULT_TLP = 'amber'

export function IndicatorsScreen({
  kase,
  specs,
  search = '',
  busy = false,
  problem,
  onRetry,
}: IndicatorsScreenProps) {
  const [query, setQuery] = useState(search)
  const [tlp, setTlp] = useState<string>(DEFAULT_TLP)

  const rows = useMemo(() => (kase ? collectIndicators(kase) : []), [kase])
  const kinds = useMemo(() => [...new Set(rows.map((row) => row.type))].sort(), [rows])
  const actionable = actionableCount(rows)

  const filters = useFilters([
    {
      key: 'type',
      label: 'Type',
      options: kinds.map((type) => ({
        value: type,
        count: rows.filter((row) => row.type === type).length,
      })),
    },
    {
      key: 'push',
      label: 'Push',
      options: [{ value: 'actionable', label: 'Actionable only', count: actionable }],
    },
  ])
  const types = filters.chosen('type')
  const actionableOnly = filters.chosen('push').length > 0

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (!matchesIndicator(row, query)) return false
        if (types.length && !types.includes(row.type)) return false
        if (actionableOnly && !isActionable(row)) return false
        return true
      }),
    [rows, query, types, actionableOnly],
  )

  const columns = useMemo(() => (specs ? indicatorColumns(specs) : []), [specs])
  const table = useEntityTable<Indicator>({
    data: visible,
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
  })

  const bundleWouldBeEmpty = nothingToPush(rows)

  /**
   * The file, inline.
   *
   * A `data:` URL rather than a blob: an object URL has to be revoked, and the
   * one moment it is safe to revoke is after a download this code cannot
   * observe starting.
   */
  const csvHref = useMemo(
    () => `data:text/csv;charset=utf-8,${encodeURIComponent(indicatorsCsv(visible, tlp))}`,
    [visible, tlp],
  )
  const csvName = `indicators${tlp ? `-tlp-${tlp}` : ''}.csv`
  const stixHref = useMemo(
    () => `data:application/json;charset=utf-8,${encodeURIComponent(indicatorsStix(visible, tlp))}`,
    [visible, tlp],
  )
  const stixName = `indicators${tlp ? `-tlp-${tlp}` : ''}.stix.json`

  return (
    <Collection
      title="Indicators"
      meta={`${String(rows.length)} derived, ${String(actionable)} actionable`}
      actions={kase ? <SourceLinks caseId={kase.id} /> : null}
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
      search={{
        column: VALUE_COLUMN,
        placeholder: "An indicator's value",
        value: query,
        onValue: setQuery,
      }}
      filters={filters}
      {...(bundleWouldBeEmpty
        ? {
            notice: {
              title: 'Every indicator in this case is benign',
              detail:
                'The bundle would leave with no objects in it. Set a disposition on the rows worth pushing first.',
            },
          }
        : {})}
      table={{ table, label: 'Indicators this case would export' }}
      empty={{
        title: 'No indicators in this case',
        detail: 'Network indicators, file digests and cloud apps appear here as they are recorded.',
      }}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <Select
            label="Marking"
            aria-label="TLP marking"
            selectedKey={tlp}
            className="w-48"
            onSelectionChange={(key) => {
              setTlp(String(key))
            }}
          >
            {/* `textValue` because React Aria cannot derive typeahead or a
                screen-reader name from a row drawn as an element. */}
            <ListBoxItem id="">No marking</ListBoxItem>
            {TLP_LEVELS.map((level) => (
              <ListBoxItem key={level} id={level} textValue={`TLP:${level.toUpperCase()}`}>
                <TlpChip tlp={`TLP:${level.toUpperCase()}`} />
              </ListBoxItem>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <ButtonLink
              variant="outline"
              size="sm"
              href={csvHref}
              download={csvName}
              data-slot="export-csv"
            >
              <Download aria-hidden />
              CSV
            </ButtonLink>
            <ButtonLink
              variant="outline"
              size="sm"
              href={stixHref}
              download={stixName}
              data-slot="export-stix"
            >
              <Share2 aria-hidden />
              STIX bundle
            </ButtonLink>
          </div>
        </div>
      }
    />
  )
}

function indicatorColumns(specs: Specs): EntityColumn<Indicator>[] {
  const tones = specs.fieldTones.disposition
  return [
    {
      accessorKey: 'type',
      header: 'Type',
      meta: { className: 'w-[12%]' },
      cell: ({ row }) => <span className="truncate text-ink-muted">{row.original.type}</span>,
    },
    {
      // The column with no width: a digest and a URL are the two longest values
      // here and both belong to it.
      accessorKey: 'value',
      header: VALUE_COLUMN,
      cell: ({ row }) => (
        <span className="block truncate font-mono text-data" title={row.original.value}>
          {row.original.value}
        </span>
      ),
    },
    {
      accessorKey: 'disposition',
      header: 'Disposition',
      meta: { className: 'w-[14%]' },
      cell: ({ row }) =>
        row.original.disposition ? (
          <FieldToneBadge
            value={row.original.disposition}
            tone={tones?.[row.original.disposition.trim().toLowerCase()]}
          />
        ) : (
          <span className="text-ink-muted">&#x2014;</span>
        ),
    },
    {
      accessorKey: 'context',
      header: 'Context',
      meta: { className: 'w-[24%]' },
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block truncate" title={row.original.context}>
          {row.original.context || '\u2014'}
        </span>
      ),
    },
    {
      accessorKey: 'blocked',
      header: 'Blocked',
      meta: { className: 'w-[10%]' },
      enableSorting: false,
      cell: ({ row }) => (
        <span className={cn('text-ink-muted')}>{row.original.blocked ? 'yes' : 'no'}</span>
      ),
    },
    {
      accessorKey: 'source',
      header: 'Source',
      meta: { className: 'w-[12%]' },
      cell: ({ row }) => (
        <span className="truncate text-ink-muted">{row.original.source || '\u2014'}</span>
      ),
    },
  ]
}

/** The three collections these rows are built from, in the table's own order. */
const SOURCES: readonly { target: string; label: string }[] = [
  { target: 'network', label: 'Network' },
  { target: 'malware', label: 'Malware' },
  { target: 'cloud_app', label: 'Cloud Apps' },
]

/**
 * Where an indicator came from, and the only way back to it.
 *
 * Every row here is derived and none is editable, so an analyst who finds one
 * wrong has to reach the collection that holds it -- and this screen offered
 * no route to any of the three.
 *
 * Links rather than buttons: they navigate, and the screen already spends its
 * one filled control on the export row. The paths are `sectionPathFor`'s, so a
 * renamed slug moves these with it rather than leaving three that render and
 * go nowhere.
 */
function SourceLinks({ caseId }: { caseId: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="text-micro uppercase tracking-micro text-ink-muted">Derived from</span>
      {SOURCES.map(({ target, label }) => {
        const href = sectionPathFor(caseId, target)
        if (href === undefined) return null
        return (
          <Link key={target} variant="muted" href={href} standalone className="text-sm">
            {label}
          </Link>
        )
      })}
    </span>
  )
}

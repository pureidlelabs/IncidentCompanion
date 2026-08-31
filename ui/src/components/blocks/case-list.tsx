import { FolderOpen, PlayCircle, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { CaseSummary } from '@/api/case'
import { casePath } from './case-paths'
import { matchesCase } from './picker-rows'
import { AsyncBoundary } from '@/components/ui/async-boundary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Link } from '@/components/ui/link'

import { ConfirmDeleteDialog } from './confirm-delete-dialog'
import { actionsColumn, DataTable, useEntityTable, type EntityColumn } from './data-table'
import { EmptyState, type EmptyOffer } from './empty-state'
import { useFilters } from './filter-set'
import { FilterControls } from './filter-controls'
import { CountBadge } from './section-head'
import { TableToolbar } from './table-toolbar'
import { Section } from './section'

/**
 * Every case on this install, and the door into one of them.
 *
 * A table rather than a stack of cards, so forty cases can be sorted and
 * narrowed, and an empty install draws the ways in instead.
 *
 * ## The action interface, which is two kinds and not one
 *
 * **Going somewhere is an `href`; changing something is a callback.** The
 * title is a `Link`, so middle-click, Cmd-click and the browser's own copy-link
 * all work, and React Aria's `RouterProvider` -- `components/ui/aria-router`,
 * mounted app-wide -- turns the same anchor into a client navigation with
 * nothing passed down for it. In Storybook there is no provider and the anchor
 * is an anchor, so this block needs no navigation prop to render.
 *
 * The writes are `onDelete` and `onTogglePin`, and the doors out of an empty
 * install are four more. **An absent callback withholds the control** rather
 * than drawing one that does nothing: no bin, no pin, and an offer that is not
 * pressable.
 *
 * ## What the block still does not do
 *
 * Nothing here edits a case. Its fields are Case settings', inside the case.
 */
export interface CaseListProps {
  /** Every case the install holds, demos included. Defaults to a worked roster. */
  cases: readonly CaseSummary[] | undefined
  /** What the search box opens with. */
  search?: string
  /** Which cases this analyst has pinned. */
  pinnedIds?: readonly string[]
  /** The listing has not arrived. Draws the skeleton in place of the table. */
  isPending?: boolean
  /**
   * What went wrong reading the list, if anything.
   *
   * A string is the server's own words; an `ApiError` lets the boundary tell a
   * refusal from a failure.
   */
  problem?: string | Error | undefined
  /** Asked again when *Try again* is pressed. Without one, no retry is offered. */
  onRetry?: (() => void) | undefined
  /**
   * Where a case opens. Defaults to the case's overview.
   *
   * The caller passes the section it has decided a case opens on; this block
   * has no registry to read one from.
   */
  caseHref?: (kase: CaseSummary) => string
  /**
   * Deletes the case, once the analyst has confirmed.
   *
   * May return a promise: a rejection keeps the dialog open and shows the
   * server's reason, which is how a case another analyst holds is refused.
   */
  onDelete?: ((caseId: string) => unknown) | undefined
  /** Pins or unpins, in the direction the row was drawn. */
  onTogglePin?: ((caseId: string, pinned: boolean) => void) | undefined
  /** The first way into an empty install. */
  onNewCase?: (() => void) | undefined
  /** Starts a case and pulls incidents into it. */
  onImportIncidents?: (() => void) | undefined
  /** Reads a case exported earlier. */
  onImportArchive?: (() => void) | undefined
  /** Leaves for the worked examples. */
  onDemoCases?: (() => void) | undefined
}

/** Open or closed, read off the row rather than off a second query. */
const STATES = ['open', 'closed'] as const

/**
 * Where a case opens when the caller has not said.
 *
 * **A module constant, not an arrow in the destructuring.** A default written
 * inline is a new function on every render, so the `columns` memo below misses
 * every time for every caller that takes the default -- which is the memo whose
 * own comment explains what a rebuilt column costs.
 */
const OVERVIEW = (kase: CaseSummary): string => casePath(kase.id, 'overview')

/**
 * The four ways into a case, in the order a first-run analyst wants them.
 *
 * Demo cases sits behind a rule: it is the one that does not start work. An
 * offer whose handler is absent draws refused rather than being dropped, so
 * the pane says what this install can do and what it cannot.
 */
function waysIn(doors: {
  onNewCase?: (() => void) | undefined
  onImportIncidents?: (() => void) | undefined
  onImportArchive?: (() => void) | undefined
  onDemoCases?: (() => void) | undefined
}): readonly EmptyOffer[] {
  return [
    {
      label: 'New case',
      icon: FolderOpen,
      hint: 'From a template, or blank',
      onSelect: doors.onNewCase,
    },
    {
      label: 'Import incidents',
      icon: Upload,
      hint: 'Start a case and pull incidents in',
      onSelect: doors.onImportIncidents,
    },
    {
      label: 'Import archive',
      icon: Upload,
      hint: 'Read a case exported earlier',
      onSelect: doors.onImportArchive,
    },
    {
      label: 'Demo cases',
      icon: PlayCircle,
      hint: 'Look around a worked example',
      apart: true,
      onSelect: doors.onDemoCases,
    },
  ]
}

export function CaseList({
  cases,
  search = '',
  pinnedIds,
  isPending = false,
  problem,
  onRetry,
  caseHref = OVERVIEW,
  onDelete,
  onTogglePin,
  onNewCase,
  onImportIncidents,
  onImportArchive,
  onDemoCases,
}: CaseListProps) {
  // The roster is absent while the read is in flight, and one place decides
  // what that draws: an empty list, with `isPending` saying why.
  const rows = cases ?? []
  const [query, setQuery] = useState(search)
  /** Which case the confirmation is open on. `null` is closed. */
  const [deleting, setDeleting] = useState<string[] | null>(null)

  const filters = useFilters([
    {
      key: 'state',
      label: 'State',
      options: STATES.map((state) => ({
        value: state,
        count: rows.filter((one) => !one.isDemo && one.status === state).length,
      })),
    },
    {
      // Widens rather than narrows, and is still a filter: it is a decision
      // the analyst made about what the table holds, so it owes a token and
      // `Clear` puts it back.
      key: 'demos',
      label: 'Demos',
      options: [
        {
          value: 'include',
          label: 'Include demo cases',
          count: rows.filter((one) => one.isDemo).length,
        },
      ],
    },
  ])
  const states = filters.chosen('state')
  const demos = filters.chosen('demos').length > 0

  // **The set the filters draw from, and what the count is measured against.**
  // Counting every row against `cases` puts the hidden demo in the total, so
  // typing one letter takes six cases to `1 of 7`.
  const pool = useMemo(() => (demos ? rows : rows.filter((one) => !one.isDemo)), [rows, demos])

  const visible = useMemo(
    () =>
      pool.filter((one) => {
        if (states.length > 0 && !states.includes(one.status)) return false
        return matchesCase(one, query)
      }),
    [pool, query, states],
  )

  const pinned = useMemo(() => new Set(pinnedIds ?? []), [pinnedIds])

  const columns = useMemo(
    () =>
      // **`pinnedIds` is deliberately not a dependency.** Rebuilding the
      // columns when the pin list changes replaces the row's button between
      // pointerdown and click and swallows the press; the current state
      // reaches the cell through the table's `meta`, which is rebuilt every
      // render.
      caseColumns(caseHref, onTogglePin),
    [caseHref, onTogglePin],
  )
  const table = useEntityTable<CaseSummary>({
    data: visible,
    columns,
    meta: {
      pendingIds: new Set(),
      pinnedIds: pinned,
      // Nothing edits a case from this list: its fields are Case settings',
      // inside the case.
      commit: () => undefined,
      ...(onDelete
        ? {
            remove: (id: string) => {
              setDeleting([id])
            },
          }
        : {}),
    },
  })

  const narrowed = query.trim() !== '' || filters.narrowed

  const clear = () => {
    setQuery('')
    filters.clear()
  }

  return (
    <Section
      title="Your cases"
      meta={<CountBadge shown={visible.length} total={pool.length} noun="case" />}
      toolbar={
        rows.length === 0 ? undefined : (
          <TableToolbar
            searchColumn="Case"
            placeholder="A case title"
            value={query}
            onValue={setQuery}
            applied={filters.applied}
            narrowed={narrowed}
            onClear={clear}
            filters={<FilterControls {...filters.controls} />}
          />
        )
      }
    >
      <AsyncBoundary
        isPending={isPending}
        isError={problem !== undefined}
        error={typeof problem === 'string' ? new Error(problem) : problem}
        skeletonRows={4}
        {...(onRetry ? { refetch: onRetry } : {})}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No cases on this install"
            detail="A case is one investigation: its timeline, its entities, and the reports written from them."
            // **Stacked and bounded, which is what four offers need.** The row
            // shape is for two or three.
            offerShape="stack"
            bounded
            offers={waysIn({ onNewCase, onImportIncidents, onImportArchive, onDemoCases })}
          />
        ) : (
          <DataTable
            table={table}
            label="Cases on this install"
            scroll="page"
            empty={
              <EmptyState
                icon={FolderOpen}
                // Names which narrowing emptied it. Clearing every filter
                // throws away decisions that were fine.
                title={demos ? 'Nothing matches' : 'Nothing matches, and demos are hidden'}
                detail={
                  demos
                    ? 'Drop a filter or shorten the search.'
                    : 'Drop a filter, shorten the search, or include the demo cases.'
                }
                action={
                  <Button variant="outline" onPress={clear}>
                    Show every case
                  </Button>
                }
              />
            }
          />
        )}
      </AsyncBoundary>

      {/* Awaits `onDelete`'s own promise, so a case another analyst holds
          renders the refusal rather than closing on a delete that did not
          happen. */}
      <ConfirmDeleteDialog
        ids={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        onConfirm={() => {
          const caseId = deleting?.[0]
          if (caseId === undefined) return undefined
          return onDelete?.(caseId)
        }}
        title={() => 'Delete this case?'}
        consequence="The case and everything recorded in it are removed. This cannot be undone."
      />
    </Section>
  )
}

/**
 * The case list's columns.
 *
 * **The title is the door, and the row is not.** A `Link` rather than a press
 * handler on the row: an analyst opens a case in a new tab constantly, and a
 * row that navigates on click offers no middle-click and nothing for the
 * browser's own copy-link. The row's other controls are then unambiguous.
 *
 * **Modified is a column because the list is ordered by nothing else an
 * analyst can see**, and customer is what an MXDR analyst carrying several
 * clients orients on before they need a ticket.
 */
function caseColumns(
  href: (kase: CaseSummary) => string,
  onTogglePin: ((caseId: string, pinned: boolean) => void) | undefined,
): EntityColumn<CaseSummary>[] {
  return [
    {
      id: 'title',
      accessorFn: (one) => one.title,
      header: 'Case',
      // The only width-less column, so it takes the remainder under
      // `table-fixed`. Exactly one may be.
      meta: { className: 'font-medium' },
      cell: ({ row: one }) => (
        // The native tooltip sits on the wrapper: `Link` takes React Aria's
        // props, and `title` is not among them.
        <span className="flex min-w-0 items-center gap-2" title={one.original.title}>
          {/* The badge sits outside the link, so the link's accessible name is
              the case's title and nothing else. */}
          <Link variant="quiet" standalone href={href(one.original)} className="truncate">
            {one.original.title}
          </Link>
          {one.original.isDemo && (
            <Badge variant="soft" size="xs">
              demo
            </Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'customer',
      header: 'Customer',
      meta: { className: 'w-[22%]' },
      cell: ({ row: one }) => (
        <span className="block truncate text-ink-muted">{one.original.customer ?? '-'}</span>
      ),
    },
    {
      accessorKey: 'reference',
      header: 'Ticket',
      meta: { className: 'w-[16%]' },
      cell: ({ row: one }) => (
        <span className="block truncate font-mono text-data text-ink-muted">
          {one.original.reference ?? '-'}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'State',
      meta: { className: 'w-[12%]' },
      cell: ({ row: one }) => (
        <Badge variant="soft" size="xs">
          {one.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'updatedAt',
      header: 'Modified',
      meta: { className: 'w-[18%]' },
      cell: ({ row: one }) => (
        <span className="block truncate text-ink-muted tabular-nums">
          {one.original.updatedAt.slice(0, 10)}
        </span>
      ),
    },
    actionsColumn<CaseSummary>(
      (one) => one.title,
      undefined,
      undefined,
      onTogglePin
        ? {
            toggle: (one, next) => {
              onTogglePin(one.id, next)
            },
          }
        : undefined,
    ),
  ]
}

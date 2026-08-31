import { FileText, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ApiError } from '@/api/client'
import type { Report, ReportBlock } from '@/api/model'
import { ConfirmDeleteDialog } from '@/components/blocks/confirm-delete-dialog'
import {
  DataTable,
  actionsColumn,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { DetailGrid, Fact } from '@/components/blocks/detail-grid'
import { EmptyState } from '@/components/blocks/empty-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Chip, FilterBar, FilterBarEnd, FilterGroup } from '@/components/blocks/filter-bar'
import {
  REPORT_STATES,
  blocksOf,
  headingOf,
  metaLine,
  outstandingIn,
  shortDate,
  stateOf,
  writtenShare,
  WRITTEN_KINDS,
  type ReportState,
} from '@/components/blocks/report-shape'
import { CountBadge } from '@/components/blocks/section-head'
import { TlpChip } from '@/components/blocks/tlp-chip'
import { Section } from '@/components/blocks/section'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

/**
 * Every report of the case, and what each still owes.
 *
 * Takes the reports and the whole `report_blocks` table, and a door per act -
 * open, start, delete, copy. Draws the table, the stage filter, the expanded
 * running order, the delete confirmation and the band a refused copy leaves.
 * A door left off draws no control for it, so a container that cannot answer
 * for an act never offers it.
 *
 * **Nothing of the editor is here**, and navigation is not its job - the
 * container's rail already lists every report with its state. The question
 * this is the only answer to is what is unfinished, so that is what it leads
 * with; the running order lives in the expanded row, numbered as the export
 * prints it with the empty sections named.
 */
export interface ReportIndexPaneProps {
  /** Every report of the case. */
  reports: readonly Report[] | undefined
  /** The whole `report_blocks` table; each row takes its own. */
  blocks: readonly ReportBlock[] | undefined
  /** Opening one. The rail is the other way in, and both land in the same place. */
  onOpen?: (reportId: string) => void
  /** Starting one. Absent draws no door, rather than a control that does nothing. */
  onNew?: () => void
  /**
   * Removing one. Absent draws no bin, rather than one that does nothing.
   *
   * May return a promise; a rejection keeps the confirmation open and shows
   * the reason in place of the usual consequence line.
   */
  onDelete?: (reportId: string) => unknown
  /**
   * Copying one. Absent draws no `Duplicate` menu row, rather than one that
   * does nothing. May return a promise; the row dims while it is unsettled.
   */
  onDuplicate?: (reportId: string) => unknown
}

/** Loosely typed on purpose: the caller's return value, not a contract this block imposes. */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'
  )
}

/**
 * What a row calls the report, so the band and the row agree on its name.
 *
 * Falls back to the same words the title cell draws for a report with no
 * label: a band naming a blank sends the analyst looking for a row that reads
 * `Untitled report`.
 */
function nameOf(reports: readonly Report[], id: string): string {
  return reports.find((one) => one.id === id)?.label || 'Untitled report'
}

/**
 * One line for why a copy was refused, in the server's own words where it gave
 * any.
 *
 * A rejection that is not the API's own carries nothing an analyst can act on,
 * so it is not passed through -- a stack frame in an alert is worse than a
 * plain sentence saying the copy did not happen.
 */
function copyRefusalReason(thrown: unknown): string {
  return thrown instanceof ApiError && thrown.message
    ? thrown.message
    : 'The copy did not go through. Try it again.'
}

/**
 * The lifecycle stage, in ink rather than in a word alone.
 *
 * Three stages and three readings: a draft is in progress, a final is settled,
 * and a sent report is frozen and gone. **Hue is never the sole carrier** -- the
 * word is in the chip beside it, exactly as the severity ramp does -- so this
 * adds a second channel to a label that already says it.
 *
 * `Sent` takes the accent and not a severity colour: leaving is not a hazard,
 * and the severity ramp answers a different question on the same screen.
 */
const STATE_TONE: Readonly<Record<ReportState, string>> = {
  Draft: 'text-ink-muted',
  Final: 'text-severity-low',
  Sent: 'text-primary',
}

export function ReportIndexPane({
  reports: reportsGiven,
  blocks: blocksGiven,
  onOpen,
  onNew,
  onDelete,
  onDuplicate,
}: ReportIndexPaneProps) {
  const blocks = blocksGiven ?? []
  const reports = reportsGiven ?? []
  // Not in the URL: this narrows a handful of rows on a view somebody arrives
  // at from the rail, and there is nothing here worth sharing a link to.
  const [stages, setStages] = useState<readonly ReportState[]>([])
  // Delete asks before it acts: the confirmation is this block's, and only
  // the answer leaves through `onDelete`.
  const [deleting, setDeleting] = useState<string[] | null>(null)
  // A copy asks nothing - the row it is made from stays untouched - so this
  // only tracks which rows are mid-flight, to dim them while `onDuplicate`'s
  // promise is unsettled.
  const [duplicatingIds, setDuplicatingIds] = useState<ReadonlySet<string>>(new Set())
  // The last copy that came back refused, by the name the row draws. One at a
  // time: a second attempt answers the question the first one left, so a list
  // of them would be a band nobody clears.
  const [copyRefusal, setCopyRefusal] = useState<{ named: string; reason: string } | null>(null)
  // Cleared the moment it stops applying - `onDelete` withdrawn, or the row
  // gone from underneath it on a repaint. Left standing, the dialog reopens
  // on its own for a stale id the next time both are true again, with no
  // button having been pressed.
  if (
    deleting &&
    (onDelete === undefined || !deleting.every((id) => reports.some((row) => row.id === id)))
  ) {
    setDeleting(null)
  }

  const counts = useMemo(() => {
    const found: Record<ReportState, number> = { Draft: 0, Final: 0, Sent: 0 }
    for (const report of reports) found[stateOf(report)] += 1
    return found
  }, [reports])

  const shown = useMemo(
    () => reports.filter((one) => stages.length === 0 || stages.includes(stateOf(one))),
    [reports, stages],
  )

  // Fires the caller's `onDuplicate` and tracks the row as busy for as long
  // as its answer is unsettled. A synchronous `onDuplicate` never enters the
  // busy set at all - there is no interval for a repaint to catch it in.
  const duplicate = (id: string) => {
    // Cleared on the attempt rather than on its answer: a refusal left
    // standing while the retry runs reads as the retry having failed too.
    setCopyRefusal(null)
    const result = onDuplicate?.(id)
    if (!isThenable(result)) return
    setDuplicatingIds((was) => new Set(was).add(id))
    const settle = () => {
      setDuplicatingIds((was) => {
        if (!was.has(id)) return was
        const next = new Set(was)
        next.delete(id)
        return next
      })
    }
    void result.then(settle, (thrown: unknown) => {
      settle()
      setCopyRefusal({ named: nameOf(reports, id), reason: copyRefusalReason(thrown) })
    })
  }

  const columns = useMemo(
    () =>
      reportColumns(
        blocks,
        onOpen,
        onDelete !== undefined,
        onDuplicate ? { onDuplicate: duplicate, busy: (id) => duplicatingIds.has(id) } : undefined,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `duplicate` closes over `onDuplicate` itself
    [blocks, onOpen, onDelete, onDuplicate, duplicatingIds],
  )
  const table = useEntityTable<Report>({
    data: shown,
    columns,
    enableExpanding: true,
    // No initial sort: the API returns reports oldest first and `reports`
    // carries no `position`, so a default here would be a second opinion
    // about the order with nothing behind it.
    meta: {
      pendingIds: duplicatingIds,
      // A report row is not edited in place - the title is the door into it,
      // which is where every field of it lives.
      commit: () => undefined,
      ...(onDelete ? { remove: (id: string) => setDeleting([id]) } : {}),
    },
  })

  if (reports.length === 0) {
    return (
      <Section title="Reports" blurb="What this case has produced, and what it still owes.">
        <EmptyState
          icon={FileText}
          title="This case has no reports"
          detail="A report is a running order of sections - your own text, and parts of the case written when it is exported."
          {...(onNew === undefined
            ? {}
            : {
                action: (
                  <Button variant="default" onPress={onNew}>
                    <Plus aria-hidden />
                    New report
                  </Button>
                ),
              })}
        />
      </Section>
    )
  }

  return (
    <Section
      title="Reports"
      meta={<CountBadge shown={shown.length} total={reports.length} noun="report" />}
      blurb="What this case has produced, and what it still owes."
      toolbar={
        <FilterBar label="Narrow the reports by stage">
          <FilterGroup label="Stage" first>
            {REPORT_STATES.map((state) => (
              <Chip
                key={state}
                label={state}
                count={counts[state]}
                pressed={stages.includes(state)}
                onToggle={() => {
                  setStages((was) =>
                    was.includes(state) ? was.filter((one) => one !== state) : [...was, state],
                  )
                }}
              />
            ))}
          </FilterGroup>
          {/* One row, and it costs six pixels. The bar is a 26px control tier,
              so a 32px primary would make it 40px; there are three chips and
              one button here, and a second row of chrome over four rows is the
              worse trade. */}
          {onNew !== undefined && (
            <FilterBarEnd>
              <Button size="xs" variant="default" onPress={onNew}>
                <Plus aria-hidden />
                New report
              </Button>
            </FilterBarEnd>
          )}
        </FilterBar>
      }
    >
      {/* Above the table rather than on the row: the row it names may be
          filtered out by the stage chips, and a copy is refused by the case
          rather than by anything the row itself holds. */}
      {copyRefusal && (
        <Alert variant="destructive" className="mb-3">
          <AlertTitle>{`${copyRefusal.named} was not copied`}</AlertTitle>
          <AlertDescription>{copyRefusal.reason}</AlertDescription>
        </Alert>
      )}

      <DataTable
        table={table}
        label="Reports"
        scroll="page"
        empty={
          <EmptyState
            icon={FileText}
            // Names which narrowing emptied it rather than showing "0 results":
            // there is exactly one filter here, so the way back is one control.
            title="No report is at that stage"
            detail={`This case has ${String(reports.length)} report${
              reports.length === 1 ? '' : 's'
            }, none of them ${stages.join(' or ').toLowerCase()}.`}
            action={
              <Button
                variant="outline"
                onPress={() => {
                  setStages([])
                }}
              >
                Show all reports
              </Button>
            }
          />
        }
        renderExpanded={(row) => {
          const own = blocksOf(blocks, row.original.id)
          const empty = new Set(outstandingIn(row.original, own).map((one) => one.id))
          return (
            <DetailGrid>
              <Fact label="Running order">
                <ol className="flex flex-col gap-0.5">
                  {own.map((block, at) => (
                    <li key={block.id} className="flex items-baseline gap-2 text-sm">
                      <span className="w-5 shrink-0 text-right text-2xs text-ink-muted tabular-nums">
                        {at + 1}
                      </span>
                      <span className="min-w-0 truncate">{headingOf(block)}</span>
                      {empty.has(block.id) && (
                        <Badge variant="soft" size="xs">
                          empty
                        </Badge>
                      )}
                    </li>
                  ))}
                </ol>
              </Fact>
              <Fact label="Shape">{metaLine(row.original, own)}</Fact>
            </DetailGrid>
          )
        }}
      />

      {onDelete && (
        <ConfirmDeleteDialog
          ids={deleting}
          onOpenChange={(isOpen) => {
            if (!isOpen) setDeleting(null)
          }}
          onConfirm={() => {
            const doomed = deleting ?? []
            return Promise.all(doomed.map((id) => onDelete(id)))
          }}
          title={(count) => (count === 1 ? 'Delete this report?' : `Delete ${String(count)} reports?`)}
          consequence="Its sections go with it. Your own written text is not kept anywhere else."
        />
      )}
    </Section>
  )
}

/** The report list's columns. */
function reportColumns(
  blocks: readonly ReportBlock[],
  onOpen?: (reportId: string) => void,
  deletable = false,
  duplicate?: { onDuplicate: (id: string) => void; busy: (id: string) => boolean },
): EntityColumn<Report>[] {
  return [
    {
      id: 'label',
      accessorFn: (one) => one.label,
      header: 'Report',
      // The only width-less column, so it takes the remainder under
      // `table-fixed`. Exactly one may be.
      meta: { className: 'font-medium' },
      // The title opens it, which is where somebody reading this row wants to
      // go next. A row that names a document and cannot be followed sends them
      // back to the rail to find the same name again.
      cell: ({ row }) => {
        // Dimmed the same way `DataCell`'s own pending rows read - the only
        // signal drawn that a copy is running, since duplicating asks
        // nothing and has no dialog of its own to hold a spinner.
        const pending = duplicate?.busy(row.original.id) ?? false
        return onOpen === undefined ? (
          <span className={cn('block truncate', pending && 'opacity-60')} title={row.original.label}>
            {row.original.label || 'Untitled report'}
          </span>
        ) : (
          <Button
            variant="link"
            size="xs"
            // No `h-auto`: `size="xs"` is the row's 24px floor, and dropping it
            // leaves the button the height of one `text-sm` line - 21px, under
            // the floor the 32px row is built to. The in-sentence exemption the
            // `owing` line above claims does not reach a table cell.
            className={cn('max-w-full justify-start px-0 text-sm font-medium', pending && 'opacity-60')}
            onPress={() => {
              onOpen(row.original.id)
            }}
          >
            <span className="block truncate" title={row.original.label}>
              {row.original.label || 'Untitled report'}
            </span>
          </Button>
        )
      },
    },
    {
      accessorKey: 'stage',
      header: 'Stage',
      meta: { className: 'w-[22%]' },
      cell: ({ row }) => (
        <span className="block truncate text-ink-muted">{row.original.stage ?? '-'}</span>
      ),
    },
    {
      id: 'state',
      accessorFn: (one) => stateOf(one),
      header: 'State',
      meta: { className: 'w-[12%]' },
      cell: ({ row }) => {
        const state = stateOf(row.original)
        return (
          <Badge variant="soft" size="xs" className={STATE_TONE[state]}>
            {state}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'tlp',
      header: 'Marking',
      meta: { className: 'w-[16%]' },
      cell: ({ row }) => <TlpChip tlp={row.original.tlp ?? ''} />,
    },
    {
      /**
       * **How much of it the analyst has actually written.**
       *
       * A derived column: there is no such field on a report, it is the written
       * sections that hold prose over the written sections there are. The
       * generated ones never count -- the case writes those at export, so
       * including them would report a finished report as part-done.
       */
      id: 'written',
      accessorFn: (one) => writtenShare(one, blocks),
      header: 'Written',
      meta: { className: 'w-[14%]' },
      cell: ({ row }) => {
        const own = blocksOf(blocks, row.original.id)
        const written = own.filter((block) => WRITTEN_KINDS.includes(block.kind))
        if (written.length === 0) {
          // A report of nothing but generated sections has no work in it, and a
          // 0-of-0 bar reads as none-done rather than as nothing-to-do.
          return <span className="text-2xs text-ink-muted">generated</span>
        }
        const done = written.length - outstandingIn(row.original, own).length
        return (
          <span className="flex items-center gap-2">
            <ProgressBar
              hideValue
              value={(done / written.length) * 100}
              aria-label={`${String(done)} of ${String(written.length)} written`}
              className="w-14"
            />
            <span className="font-mono text-2xs tabular-nums text-ink-muted">
              {done}/{written.length}
            </span>
          </span>
        )
      },
    },
    {
      id: 'sections',
      accessorFn: (one) => blocksOf(blocks, one.id).length,
      header: 'Sections',
      meta: { className: 'w-[10%]' },
      cell: ({ row }) => (
        <span className="text-ink-muted tabular-nums">
          {blocksOf(blocks, row.original.id).length}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      meta: { className: 'w-[12%]' },
      cell: ({ row }) => (
        <span className="text-ink-muted tabular-nums">
          {shortDate(row.original.createdAt)}
        </span>
      ),
    },
    // Only where a caller answers for it - a read-only render draws no bin,
    // no chevron and no overflow menu rather than three controls that do
    // nothing. Every row already expands by being pressed regardless, so
    // this column's absence costs nothing but the affordance.
    ...(deletable || duplicate
      ? [
          actionsColumn<Report>(
            (row) => row.label || `Untitled report ${row.id.slice(0, 8)}`,
            duplicate
              ? (row) => [
                  [
                    {
                      id: 'duplicate',
                      label: duplicate.busy(row.id) ? 'Duplicating\u2026' : 'Duplicate',
                      disabled: duplicate.busy(row.id),
                      onSelect: () => {
                        duplicate.onDuplicate(row.id)
                      },
                    },
                  ],
                ]
              : undefined,
          ),
        ]
      : []),
  ]
}

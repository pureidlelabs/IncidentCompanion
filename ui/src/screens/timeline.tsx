import { flexRender } from '@tanstack/react-table'
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CalendarClock,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react'

import { isEvent, type Case, type TimelineEntry } from '@/api/model'
import { formSpec, type Specs } from '@/api/specs'
import { TIMELINE_WRITE_SCHEMAS } from '@contract/collections'
import { BulkActionBar } from '@/components/blocks/bulk-actions'
import { ConfirmDeleteDialog } from '@/components/blocks/confirm-delete-dialog'
import {
  selectionColumn,
  useEntityTable,
  type EntityTable,
} from '@/components/blocks/data-table'
import { EmptyState } from '@/components/blocks/empty-state'
import { EntityDialog } from '@/components/blocks/entity-dialog'
import {
  Chip,
  FilterBar,
  FilterBarEnd,
  FilterGroup,
  FilterPicker,
  PickerGroup,
  PickerRow,
} from '@/components/blocks/filter-bar'
import { MergeReview } from '@/components/blocks/merge-review'
import { RowContextMenu, type RowMenuGroup } from '@/components/blocks/row-menu'
import { CountBadge } from '@/components/blocks/section-head'
import { AsyncBoundary } from '@/components/ui/async-boundary'
import { Section } from '@/components/blocks/section'
import { TimelineEntryRow, TimelineGapMark } from './timeline-entry-row'
import { Button } from '@/components/ui/button'
import { TimeBrush } from '@/components/ui/time-brush'
import { ToggleButton, ToggleButtonGroup } from '@/components/ui/toggle-button'
import { dayKeyOf, dayLabelOf, durationText } from '@/lib/case-time'
import { spanOf, type TimeWindow } from '@/lib/time-window'

import { entityNames, referenceOptions } from '@/components/blocks/entity-scope'
import { localId, useRowEditor } from '@/components/blocks/row-editing'
import {
  activeCount,
  applyTimelineFilter,
  BLANK_ACTION,
  BLANK_EVENT,
  countsFor,
  gapsBefore,
  isTimelineFiltered,
  NO_TIMELINE_FILTER,
  phasesOf,
  runsOf,
  sortEntries,
  timelineRowActions,
  timesOf,
  withoutTimelineEntries,
  type TimelineFilter,
  type TimelineRowAction,
} from './timeline-entries'

/** Stable, so the table's meta does not change identity every render. */
const EMPTY_SELECTION_PENDING: ReadonlySet<string> = new Set()

/**
 * The fields one of the two timeline forms produced.
 *
 * **Untyped past the collection, because the collection is.** An event and an
 * activity validate against different schemas, so there is no one shape a
 * patch to a timeline row has -- which is why `kind` travels beside the fields
 * rather than being read off them.
 */
export type TimelineFields = Partial<Record<string, unknown>>

/**
 * Where this screen's writes go when something is serving it.
 *
 * **Each one resolves with what the server stored**, and the list is updated
 * from that rather than from a copy this screen merged itself. The version
 * check can refuse, and a screen that had already merged its own answer would
 * be showing a value the case does not hold.
 *
 * **Two, not three.** Every other collection screen carries a `patch` for the
 * bulk bar, and this one offers no bulk edit at all: an event and an activity
 * share no field, so the bar draws Delete alone. A `patch` here would be a
 * member nothing on the screen could ever call.
 *
 * `save` carries the kind separately from the fields, for the reason the
 * server gives for the collection having no schema of its own: which fields a
 * row takes depends on whether it is an event or an activity, and a container
 * handed the fields alone would have to guess.
 */
export interface TimelineWrites {
  /** `entry` null creates. Resolves with the stored row. */
  save: (
    entry: TimelineEntry | null,
    fields: TimelineFields,
    kind: 'event' | 'action',
  ) => Promise<TimelineEntry>
  remove: (ids: readonly string[]) => Promise<void>
}

/** Which of the two forms a stored row answers to. */
function kindOf(entry: TimelineEntry): 'event' | 'action' {
  return isEvent(entry) ? 'event' : 'action'
}

/**
 * The timeline answering itself, which is what a story is.
 *
 * The same interface a container implements, so the screen has one write path
 * rather than a served branch and a gallery branch.
 */
function galleryWrites(): TimelineWrites {
  return {
    save: (entry, fields, kind) =>
      Promise.resolve(
        entry
          ? { ...entry, ...fields }
          : {
              ...(kind === 'event' ? BLANK_EVENT : BLANK_ACTION),
              ...fields,
              id: localId(kind),
            },
      ),
    remove: () => Promise.resolve(),
  }
}

export interface TimelineScreenProps {
  kase: Case | undefined
  specs: Specs | undefined
  /** What the search box opens with. */
  search?: string
  /** Newest first is the default: the last thing that happened is the question. */
  newestFirst?: boolean
  /** What the brush opens with. `null`, the default, is the whole case. */
  timeWindow?: TimeWindow | null
  /** A row write another analyst got in first with. */
  refusal?: { field: string; row: string; by: string }
  /**
   * The case is still being read.
   *
   * Nothing is drawn while this holds: a read that has not returned is not
   * an answer, and an ungated pending state shows another case's entries.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
  /**
   * Omitted in the gallery, where a save changes this screen's own copy of the
   * timeline and nothing else.
   *
   * Supplied, every write leaves and the list is updated from what comes back.
   */
  writes?: TimelineWrites
}

/**
 * The case as it happened: what the attacker did, and what the SOC did back.
 *
 * The screen serves four jobs in sequence - capture, filter, hunt the holes,
 * write up - and three of them are the list rather than the row.
 *
 * - **Nothing load-bearing sits behind a disclosure.** Severity, kind, the
 *   entities, the sentence and the phase are all scanned, so they are all on
 *   the row. Source, confidence and provenance are what may recede.
 * - **A hole in the record is drawn.** An hour of quiet between two rows is a
 *   marker to hunt for missing events, not whitespace.
 * - **The rail is painted from tokens, never from the entry's stored hex.**
 *   The demo case carries a baked colour per entry, and a baked colour has no
 *   theme to consult.
 * - **Two add doors, and each opens its own form.** An event answers to
 *   `EVENT_FIELDS` and an activity to `TIMELINE_ACTION_FIELDS`, which is the
 *   reason they are two doors rather than one asking which.
 */
export function TimelineScreen({
  kase,
  specs,
  search = '',
  newestFirst: initialOrder = true,
  timeWindow = null,
  refusal,
  busy = false,
  problem,
  onRetry,
  writes,
}: TimelineScreenProps) {
  /** One write path. Omitted, the gallery answers for itself. */
  const write = writes ?? galleryWrites()
  const [filter, setFilter] = useState<TimelineFilter>({
    ...NO_TIMELINE_FILTER,
    q: search,
    window: timeWindow,
  })
  const [newestFirst, setNewestFirst] = useState(initialOrder)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  /** Which of the two add doors is open, if either. */
  const [adding, setAdding] = useState<'event' | 'action' | null>(null)
  /** The row the pencil opened, which is the same dialog under another title. */
  const editor = useRowEditor<TimelineEntry>()
  /** Where the last right click landed, and on which row. `null` is closed. */
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; id: string } | null>(null)
  const closeMenu = useCallback(() => {
    setMenuAt(null)
  }, [])

  const [entries, setEntries] = useState(kase?.timeline ?? [])
  const [given, setGiven] = useState(kase)
  if (given !== kase) {
    setGiven(kase)
    setEntries(kase?.timeline ?? [])
  }
  const names = useMemo(
    () =>
      kase
        ? entityNames(kase)
        : { system: new Map<string, string>(), account: new Map<string, string>() },
    [kase],
  )

  // The track is the *case's* extent, never the filtered list's: a brush whose
  // own scale moved every time it was dragged could not be dragged back.
  const times = useMemo(() => timesOf(entries), [entries])
  const span = useMemo(() => spanOf(times), [times])

  // The served vocabulary, so a chip exists for a level this case happens to
  // have none of - and reads zero rather than being absent.
  const severities = specs?.vocabularies.severity ?? []

  const kindCounts = useMemo(() => countsFor(entries, filter, 'kind'), [entries, filter])
  const severityCounts = useMemo(() => countsFor(entries, filter, 'severity'), [entries, filter])
  const phaseCounts = useMemo(() => countsFor(entries, filter, 'phase'), [entries, filter])
  const phases = useMemo(() => phasesOf(entries), [entries])

  const visible = useMemo(
    () => sortEntries(applyTimelineFilter(entries, filter), newestFirst),
    [entries, filter, newestFirst],
  )
  const runs = useMemo(() => runsOf(visible), [visible])
  const gaps = useMemo(() => gapsBefore(runs.map((run) => run.lead)), [runs])

  /** Rows queued for the delete confirmation. `null` closes the dialog. */
  const [deleting, setDeleting] = useState<string[] | null>(null)

  /**
   * Selection over the visible entries, kept by the same TanStack instance
   * `entities` and `evidence` build with `useEntityTable` -- so one selection
   * model backs every collection screen, even where the row is drawn by hand
   * rather than by `DataTable`. The single `selectionColumn` is never rendered
   * as a grid column; its header and cell are read back through `flexRender`
   * below, which is what keeps the checkbox one implementation rather than a
   * second copy of its markup.
   */
  const selectionColumns = useMemo(
    () => [selectionColumn<TimelineEntry>((row) => `Select ${row.description || 'entry'}`)],
    [],
  )
  const table: EntityTable<TimelineEntry> = useEntityTable<TimelineEntry>({
    data: visible,
    columns: selectionColumns,
    meta: { pendingIds: EMPTY_SELECTION_PENDING, commit: () => undefined },
  })
  const selectHeader = table
    .getHeaderGroups()
    .at(-1)
    ?.headers.find((header) => header.column.id === 'select')
  const selectAllCheckbox: ReactNode = selectHeader
    ? flexRender(selectHeader.column.columnDef.header, selectHeader.getContext())
    : null
  const checkboxFor = (id: string): ReactNode => {
    const cell = table
      .getRow(id)
      .getVisibleCells()
      .find((one) => one.column.id === 'select')
    return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null
  }

  /**
   * What one row offers, and what pressing it does.
   *
   * One list drives the row's `...` and its right click, so the shortcut
   * cannot offer anything the visible control does not -- which is the rule
   * `context-menu` states and the only thing that makes a hidden menu fair.
   */
  const act = (entry: TimelineEntry, action: TimelineRowAction) => {
    switch (action.kind) {
      case 'new-after':
        setAdding(action.noun)
        return
      case 'filter':
        setFilter(action.next)
        return
      case 'copy':
        // No `?.` - there is no plaintext port in this app, so `clipboard` is
        // never the undefined it is over plain HTTP.
        void navigator.clipboard.writeText(action.text)
        return
      case 'review':
        // A row write like any other, so it leaves through the same door the
        // dialog does -- a reviewed flag another analyst has already set is
        // refused by the same version check.
        void write.save(entry, { unreviewed: action.unreviewed }, kindOf(entry)).then((stored) => {
          setEntries((current) => current.map((row) => (row.id === entry.id ? stored : row)))
        })
        return
      case 'edit':
        editor.edit(entry)
        return
      case 'delete':
        void write.remove([entry.id]).then(() => {
          setEntries((current) => withoutTimelineEntries(current, new Set([entry.id])))
        })
        return
    }
  }

  /** The same items, in the shape both menu surfaces draw. */
  const menuGroups = (entry: TimelineEntry): RowMenuGroup[] =>
    timelineRowActions(entry, { filter, editable: true, deletable: true }).map((group) =>
      group.map((item) => ({
        id: item.id,
        label: item.label,
        danger: item.kind === 'delete',
        onSelect: () => {
          act(entry, item)
        },
      })),
    )

  const menuEntry = menuAt ? entries.find((entry) => entry.id === menuAt.id) : undefined

  /**
   * Which form is on screen, from either door.
   *
   * An edit reads the row's own kind: an event answers to `EVENT_FIELDS` and
   * an activity to `TIMELINE_ACTION_FIELDS`, which is the same reason the two
   * add doors are two.
   */
  const writing: 'event' | 'action' | null = editor.editing
    ? isEvent(editor.editing)
      ? 'event'
      : 'action'
    : adding

  const narrowed = isTimelineFiltered(filter)
  const toggle = (list: readonly string[], value: string): string[] =>
    list.includes(value) ? list.filter((one) => one !== value) : [...list, value]

  return (
    <Section
      title="Timeline"
      meta={
        <CountBadge
          shown={narrowed ? visible.length : entries.length}
          total={entries.length}
          noun="entry"
          plural="entries"
        />
      }
      actions={
        // Two doors, never one split button: an analyst who already knows
        // which of the two they are recording should not be asked again.
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              setAdding('event')
            }}
          >
            <Plus aria-hidden />
            New event
          </Button>
          <Button
            variant="default"
            size="sm"
            onPress={() => {
              setAdding('action')
            }}
          >
            <ShieldCheck aria-hidden />
            New activity
          </Button>
        </div>
      }
      toolbar={
        entries.length === 0 ? undefined : (
          <FilterBar label="Filter the timeline">
            <FilterGroup first>
              <Chip
                label="All"
                count={entries.length}
                pressed={!narrowed}
                onToggle={() => {
                  setFilter(NO_TIMELINE_FILTER)
                }}
              />
              <Chip
                label="Events"
                count={kindCounts.get('event') ?? 0}
                pressed={filter.kind === 'event'}
                onToggle={() => {
                  setFilter((was) => ({ ...was, kind: was.kind === 'event' ? '' : 'event' }))
                }}
              />
              <Chip
                label="Activities"
                count={kindCounts.get('action') ?? 0}
                pressed={filter.kind === 'action'}
                onToggle={() => {
                  setFilter((was) => ({ ...was, kind: was.kind === 'action' ? '' : 'action' }))
                }}
              />
            </FilterGroup>

            <FilterGroup label="Severity">
              {severities.map((level) => (
                <Chip
                  key={level}
                  label={level}
                  count={severityCounts.get(level) ?? 0}
                  pressed={filter.severities.includes(level)}
                  onToggle={() => {
                    setFilter((was) => ({ ...was, severities: toggle(was.severities, level) }))
                  }}
                />
              ))}
            </FilterGroup>

            <FilterGroup>
              {/* Phase is whatever this case holds - nine on the campaign
                  case - so it is a picker rather than nine permanent chips. */}
              <FilterPicker label="Kill chain phase" active={filter.phases.length}>
                {phases.length === 0 ? (
                  <p className="px-2 pb-2 text-xs text-ink-muted">No phase on any entry yet.</p>
                ) : (
                  <PickerGroup label="Recorded on this case">
                    {phases.map((phase) => (
                      <PickerRow
                        key={phase}
                        label={phase}
                        count={phaseCounts.get(phase) ?? 0}
                        checked={filter.phases.includes(phase)}
                        onToggle={() => {
                          setFilter((was) => ({ ...was, phases: toggle(was.phases, phase) }))
                        }}
                      />
                    ))}
                  </PickerGroup>
                )}
              </FilterPicker>
            </FilterGroup>

            <FilterBarEnd>
              {narrowed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setFilter(NO_TIMELINE_FILTER)
                  }}
                >
                  {`Clear ${String(activeCount(filter))}`}
                </Button>
              )}
            </FilterBarEnd>

            {/* The brush and the sort share a row: both arrange the list
                rather than narrowing it by a value an entry carries, and the
                brush is the one control here that needs the width. */}
            <div className="flex w-full min-w-0 items-center gap-3 pt-0.5">
              {span !== null && (
                <TimeBrush
                  times={times}
                  span={span}
                  value={filter.window}
                  onChange={(next) => {
                    setFilter((was) => ({ ...was, window: next }))
                  }}
                />
              )}
              <ToggleButtonGroup
                className="ml-auto shrink-0"
                aria-label="Sort order"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[newestFirst ? 'newest' : 'oldest']}
                onSelectionChange={(keys) => {
                  setNewestFirst(!keys.has('oldest'))
                }}
              >
                <ToggleButton id="oldest" size="sm">
                  <ArrowUpWideNarrow aria-hidden className="size-3.5" />
                  Oldest
                </ToggleButton>
                <ToggleButton id="newest" size="sm">
                  <ArrowDownWideNarrow aria-hidden className="size-3.5" />
                  Newest
                </ToggleButton>
              </ToggleButtonGroup>
            </div>
          </FilterBar>
        )
      }
    >
      <AsyncBoundary
        isPending={busy}
        isError={problem !== undefined}
        error={problem}
        {...(onRetry ? { refetch: onRetry } : {})}
      >
        {/* Above the body rather than in it: the body is swapped whole for an
          empty state when a filter matches nothing, and the row the refusal
          names is exactly the row a filter may be hiding. */}
        {refusal && (
          <MergeReview field={refusal.field} by={refusal.by} row={refusal.row} className="mb-3" />
        )}

        {visible.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={
              narrowed
                ? 'No entry matches all of these filters at once'
                : 'Nothing on the timeline yet'
            }
            detail={
              narrowed
                ? `${String(entries.length)} entries in the case, none matching every filter together.`
                : 'Entries added here drive the graph, the kill chain and the report.'
            }
            {...(narrowed
              ? {
                  action: (
                    <Button
                      variant="outline"
                      onPress={() => {
                        setFilter(NO_TIMELINE_FILTER)
                      }}
                    >
                      Clear every filter
                    </Button>
                  ),
                }
              : {})}
          />
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-ink-muted">
                {selectAllCheckbox}
                {`Select all ${String(visible.length)} shown`}
              </span>
              <BulkActionBar
                table={table}
                // No bulk edit: an event and an activity share no field, the
                // same reason the entities screen's mixed table offers none.
                fields={[]}
                onApply={() => undefined}
                onRequestDelete={setDeleting}
              />
            </div>
            <ol aria-label="Timeline entries" className="rounded-sm border border-border">
              {runs.map((run, at) => {
                const previous = runs[at - 1]?.lead
                const dayChanged =
                  previous === undefined || dayKeyOf(previous.time) !== dayKeyOf(run.lead.time)
                const gap = gaps.get(at)
                return (
                  <Fragment key={run.lead.id}>
                    {dayChanged ? (
                      <li>
                        <h3
                          data-slot="timeline-day"
                          className="border-b border-border bg-muted/40 px-4 py-1 text-2xs font-semibold uppercase tracking-micro text-ink-muted"
                        >
                          {dayLabelOf(run.lead.time)}
                          {gap !== undefined && (
                            <span className="ml-2 font-normal normal-case tracking-normal text-severity-info">
                              {`${durationText(gap)} with nothing recorded`}
                            </span>
                          )}
                        </h3>
                      </li>
                    ) : (
                      gap !== undefined && <TimelineGapMark span={gap} />
                    )}
                    <TimelineEntryRow
                      run={run}
                      names={names}
                      open={open.has(run.lead.id)}
                      checkbox={checkboxFor(run.lead.id)}
                      onToggle={() => {
                        setOpen((was) => {
                          const next = new Set(was)
                          if (!next.delete(run.lead.id)) next.add(run.lead.id)
                          return next
                        })
                      }}
                      menu={menuGroups(run.lead)}
                      onEdit={() => {
                        editor.edit(run.lead)
                      }}
                      onDelete={() => {
                        act(run.lead, { id: 'delete', kind: 'delete', label: 'Delete' })
                      }}
                      onRightClick={setMenuAt}
                    />
                    {open.has(run.lead.id) &&
                      run.members.slice(1).map((entry) => (
                        <TimelineEntryRow
                          key={entry.id}
                          run={{ lead: entry, members: [entry] }}
                          names={names}
                          folded
                          checkbox={checkboxFor(entry.id)}
                          menu={menuGroups(entry)}
                          onEdit={() => {
                            editor.edit(entry)
                          }}
                          onDelete={() => {
                            act(entry, { id: 'delete', kind: 'delete', label: 'Delete' })
                          }}
                          onRightClick={setMenuAt}
                        />
                      ))}
                  </Fragment>
                )
              })}
            </ol>
          </>
        )}

        <RowContextMenu
          at={menuAt}
          onClose={closeMenu}
          label={menuEntry?.description ?? 'entry'}
          groups={menuEntry ? menuGroups(menuEntry) : []}
        />

        {kase && specs && writing !== null && (
          <EntityDialog
            // Remounted per row: the draft is the dialog's own state, so one
            // kept mounted across two rows shows the first row's values.
            key={editor.editing?.id ?? writing}
            open
            onOpenChange={() => {
              setAdding(null)
              editor.close()
            }}
            collection="timeline"
            title={
              editor.editing
                ? writing === 'event'
                  ? 'Edit event'
                  : 'Edit activity'
                : writing === 'event'
                  ? 'New event'
                  : 'New activity'
            }
            form={formSpec(specs, writing === 'event' ? 'EVENT_FIELDS' : 'TIMELINE_ACTION_FIELDS')}
            // `kind` is never a control on either form - it comes from which
            // door was pressed, not from the draft - so the schema is checked
            // without it. `write.save` carries `writing` as its own argument
            // for exactly this: the container adds `kind` when it builds the
            // request, the same place `creatableFields` does today.
            schema={
              writing === 'event'
                ? TIMELINE_WRITE_SCHEMAS.event.omit({ kind: true })
                : TIMELINE_WRITE_SCHEMAS.action.omit({ kind: true })
            }
            references={referenceOptions(kase)}
            {...(editor.editing ? { entry: editor.editing } : {})}
            onCreate={(fields) => {
              const editing = editor.editing
              setAdding(null)
              editor.close()
              void write.save(editing, fields, writing).then((stored) => {
                setEntries((current) =>
                  editing
                    ? current.map((row) => (row.id === editing.id ? stored : row))
                    : [...current, stored],
                )
              })
            }}
          />
        )}

        <ConfirmDeleteDialog
          ids={deleting}
          onOpenChange={(isOpen) => {
            if (!isOpen) setDeleting(null)
          }}
          onConfirm={() => {
            const doomed = deleting ?? []
            table.resetRowSelection()
            void write.remove(doomed).then(() => {
              setEntries((current) => withoutTimelineEntries(current, new Set(doomed)))
            })
          }}
          title={(count) =>
            count === 1 ? 'Delete this entry?' : `Delete ${String(count)} entries?`
          }
          consequence="They go in one step; the graph and the report update to match."
        />
      </AsyncBoundary>
    </Section>
  )
}

import { useCallback, useMemo, useState, type ReactNode } from 'react'

import type {
  AccountEntry,
  Case,
  CollectionName,
  CloudAppEntry,
  MalwareEntry,
  NetworkIndicator,
  SystemEntry,
} from '@/api/model'
import { fieldOf, formSpec, shortLabel, type FormSpec, type Specs } from '@/api/specs'
import { Absent } from '@/components/ui/absent'
import { BulkActionBar, bulkFieldsFor, type BulkField } from '@/components/blocks/bulk-actions'
import { ConfirmDeleteDialog } from '@/components/blocks/confirm-delete-dialog'
import {
  BooleanCell,
  ReferenceCell,
  SelectCell,
  TextCell,
} from '@/components/blocks/data-cell'
import {
  DataTable,
  actionsColumn,
  selectionColumn,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { StoredFacts } from '@/components/blocks/detail-grid'
import { EntityDialog, type ReferenceOptions } from '@/components/blocks/entity-dialog'
import { EmptyState, type EmptyOffer } from '@/components/blocks/empty-state'
import { FilterControls } from '@/components/blocks/filter-controls'
import { useFilters } from '@/components/blocks/filter-set'
import { MergeReview } from '@/components/blocks/merge-review'
import { FieldToneBadge, ROLE_INK, paintFor } from '@/components/blocks/severity-badge'
import type { FieldToneSpec } from '@/api/specs'
import { TableToolbar } from '@/components/blocks/table-toolbar'
import { AddAction, CountBadge } from '@/components/blocks/section-head'
import { Section } from '@/components/blocks/section'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

import { localId, useRowEditor } from './row-editing'
import {
  ENTITY_KINDS,
  NO_FILTER,
  applyEntityFilter,
  attentionCounts,
  entityNames,
  entityRows,
  isNarrowed,
  kindFor,
  referenceOptions,
  searchEntities,
  toneOf,
  withPatched,
  withRow,
  type EntityFilter,
  type EntityKind,
  type EntityRowView,
  type EntityScope,
} from './entity-scope'

/**
 * Every entity in the case, and each kind on its own, on one shape.
 *
 * The scope row, the search box and the filter bar are the same elements at
 * the same pixels at every scope; the table body is what changes. Unscoped it
 * is a generic five columns over every kind; scoped it is the kind's own
 * columns over that kind's rows.
 *
 * - **Search spans every kind at every scope.** The scope row's counts are the
 *   search's answer per kind, which is the lookup no single-kind screen can do.
 * - **Kind is a facet at the unscoped scope only.** Scoped, the row above names
 *   it and every other chip would read zero.
 * - Deleting takes rows out of the local copy of the case, so a story shows
 *   what the table does after a delete rather than what it does before one.
 * - **The add door and the pencil both open `EntityDialog` on the served
 *   form**, and what they save lands in that same local copy. The unscoped
 *   view has no add door: five kinds have no one form, and asking which by
 *   menu is the disclosure the add doors exist not to be.
 */
export interface EntityScopeTableProps {
  /** The case to draw. */
  kase: Case | undefined
  /** The served forms and tones. */
  specs: Specs | undefined
  /** Which scope the screen opens on. */
  scope?: EntityScope
  /** What the search box opens with. */
  search?: string
  /** A row to scroll to and flash, as an entity link's `?highlight=` does. */
  highlightId?: string
  /** A write another analyst refused, drawn above the table. */
  refusal?: { field: string; row: string; by: string }
  /** Rejects a delete rather than performing it, for the refused-write story. */
  refuseDelete?: (() => Promise<never>) | undefined
  /** Omitted in the gallery, where a row is written into the local copy only. */
  writes?: EntityWrites
  /**
   * The case is still being read.
   *
   * Nothing is drawn while this holds.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

/**
 * Where an entity leaves the block.
 *
 * **`collection` rather than a scope**, because five kinds sit behind one
 * table and each is its own collection on the server -- `entityKinds.ts` is
 * what carries the mapping, and the block already holds the kind at both call
 * sites. A delete names the version it read for the same reason every other
 * write here does.
 */
export interface EntityWrites {
  /** `entry` null creates. Resolves with the stored row. */
  save: (
    collection: CollectionName,
    entry: { id: string; version: number } | null,
    fields: object,
  ) => Promise<Record<string, unknown>>
  remove: (
    rows: readonly { collection: CollectionName; id: string; version: number }[],
  ) => Promise<void>
}

/** The case with the named rows gone, whichever collection they came from. */
function withoutRows(kase: Case, doomed: ReadonlySet<string>): Case {
  const keep = <T extends { id: string }>(rows: readonly T[]) =>
    rows.filter((row) => !doomed.has(row.id))
  return {
    ...kase,
    systems: keep(kase.systems),
    accounts: keep(kase.accounts),
    networkIndicators: keep(kase.networkIndicators),
    malware: keep(kase.malware),
    cloudApps: keep(kase.cloudApps),
  }
}

export function EntityScopeTable({
  kase,
  specs,
  scope: initialScope = 'all',
  search = '',
  highlightId,
  refusal,
  refuseDelete,
  writes,
  busy = false,
  problem,
  onRetry,
}: EntityScopeTableProps) {
  const [source, setSource] = useState(kase)
  const [given, setGiven] = useState(kase)
  if (given !== kase) {
    setGiven(kase)
    setSource(kase)
  }

  const [scope, setScope] = useState<EntityScope>(initialScope)
  const [query, setQuery] = useState(search)
  const [deleting, setDeleting] = useState<string[] | null>(null)
  const [highlight, setHighlight] = useState(highlightId)
  const editor = useRowEditor<{ kind: EntityKind; entry: Record<string, unknown> }>()

  const rows = useMemo(
    () => (source && specs ? entityRows(source, specs.fieldTones) : []),
    [source, specs],
  )
  const scopeRows = useMemo(
    () => (scope === 'all' ? rows : rows.filter((row) => row.slug === scope)),
    [rows, scope],
  )
  const counts = useMemo(() => attentionCounts(scopeRows), [scopeRows])
  const kindCounts = useMemo(() => {
    const found = new Map<string, number>()
    for (const row of searchEntities(scopeRows, { ...NO_FILTER, q: query })) {
      found.set(row.kind, (found.get(row.kind) ?? 0) + 1)
    }
    return found
  }, [scopeRows, query])

  /**
   * **Kind is offered at the unscoped view only, and goes on filtering below
   * it.** An empty option list hides the chips without dropping what is
   * chosen, which is what keeps the token on the bar: a rail row that narrows
   * to Assets and a Kind filter nobody can see used to disagree in silence.
   */
  const filters = useFilters([
    {
      key: 'kind',
      label: 'Kind',
      options:
        scope === 'all'
          ? ENTITY_KINDS.map((entry) => ({
              value: entry.title,
              count: kindCounts.get(entry.title) ?? 0,
            }))
          : [],
    },
    {
      // The pair contradicts itself: a row cannot both need attention and be
      // clear, so choosing one drops the other rather than adding to it.
      key: 'attention',
      label: 'Attention',
      mode: 'one',
      options: [
        { value: 'attention', label: 'Needs attention', count: counts.attention },
        { value: 'clear', label: 'Clear', count: counts.clear },
      ],
    },
  ])

  const kinds = filters.chosen('kind')
  const attention = filters.one('attention') ?? ''
  const filter: EntityFilter = { q: query, kinds, attention }

  /**
   * What a reference field offers, by the collection it points at.
   *
   * Every kind's form, not just the two the table's own columns read:
   * `SYSTEM_FIELDS`, `ACCOUNT_FIELDS`, `MALWARE_FIELDS`, `NETWORK_FIELDS` and
   * `CLOUD_APP_FIELDS` all carry a `methods` reference, and malware and the
   * network fields cross-reference each other's collection too.
   */
  const references: ReferenceOptions = useMemo(
    () => (source ? referenceOptions(source) : {}),
    [source],
  )

  const searched = useMemo(() => searchEntities(rows, { ...NO_FILTER, q: query }), [rows, query])
  const visible = applyEntityFilter(scopeRows, filter)

  const open = useCallback((row: EntityRowView) => {
    setScope(row.slug)
    setHighlight(row.id)
  }, [])

  const remove = (ids: readonly string[]) => {
    // The kind is resolved before the rows go, since `findRow` reads `source`.
    const doomed = ids
      .map((id) => findRow(id))
      .filter((found) => found !== null)
      .map((found) => ({
        collection: found.kind.collection,
        id: String(found.entry.id),
        version: (found.entry as { version?: number }).version ?? 0,
      }))
    setSource((current) => (current ? withoutRows(current, new Set(ids)) : current))
    if (writes && doomed.length > 0) void writes.remove(doomed)
  }

  /** The row behind an id, with the kind that says which form describes it. */
  const findRow = (id: string) => {
    if (!source) return null
    for (const entry of ENTITY_KINDS) {
      const found = entry.rows(source).find((row) => String(row.id) === id)
      if (found) return { kind: entry, entry: found }
    }
    return null
  }

  const save = (target: EntityKind, entry: Record<string, unknown> | null, fields: object) => {
    const row: Record<string, unknown> = entry
      ? { ...fields, id: entry.id }
      : { ...fields, id: localId(target.slug), version: 1 }
    setSource((current) => (current ? withRow(current, target.slug, row) : current))
    // The new row is what the analyst just described, so the table scrolls to
    // it rather than leaving them to find it in eighty.
    setHighlight(String(row.id))
    editor.close()
    if (writes) {
      const stored = entry
        ? { id: String(entry.id), version: (entry as { version?: number }).version ?? 0 }
        : null
      void writes.save(target.collection, stored, fields)
    }
  }

  const kind = kindFor(scope)
  const narrowed = isNarrowed(filter)

  const label = kind?.title ?? 'Entities'

  return (
    <Section
      title={label}
      // **Withheld while the read is out, not drawn as nothing.** The body is
      // gated behind the boundary and the head is not, so a count derived from
      // rows that have not arrived says `0 rows` beside the title -- and a case
      // still loading reads exactly like a case holding none.
      // **Withheld while the read is out, not drawn as nothing.** The body is
      // gated behind the boundary and the head is not, so a count derived from
      // rows that have not arrived says `0 rows` beside the title -- and a case
      // still loading reads exactly like a case holding none.
      {...(busy ? {} : { meta: <CountBadge shown={visible.length} total={scopeRows.length} noun="row" /> })}
      actions={
        kind ? (
          <AddAction
            label={`Add ${kind.title.replace(/s$/, '').toLowerCase()}`}
            onPress={editor.add}
          />
        ) : undefined
      }
      toolbar={
        <>
          <ScopeRow
            scope={scope}
            counts={searched}
            onScope={(next) => {
              setScope(next)
              setHighlight(undefined)
            }}
          />
          <TableToolbar
            className="z-20"
            searchColumn="Entity"
            placeholder="Name or value"
            value={query}
            onValue={setQuery}
            applied={filters.applied}
            narrowed={narrowed}
            onClear={() => {
              setQuery('')
              filters.clear()
            }}
            filters={<FilterControls {...filters.controls} />}
          />
        </>
      }
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
    >
      {refusal && (
        <MergeReview field={refusal.field} by={refusal.by} row={refusal.row} className="mb-3" />
      )}

      {source && specs && (
        <ScopeBody
          scope={scope}
          kase={source}
          specs={specs}
          rows={visible}
          total={scopeRows.length}
          narrowed={narrowed}
          highlightId={highlight}
          onOpen={open}
          onScope={(next) => {
            setScope(next)
            setHighlight(undefined)
          }}
          onDelete={setDeleting}
          onEdit={(id) => {
            const found = findRow(id)
            if (found) editor.edit(found)
          }}
          onBulkApply={(slug, ids, patch) => {
            setSource((current) => (current ? withPatched(current, slug, ids, patch) : current))
            const collection = kindFor(slug)?.collection
            if (writes && collection) {
              // One row at a time: the version check is per row, and the block
              // holds the version each of these was read at.
              for (const id of ids) {
                const found = findRow(id)
                if (found) {
                  void writes.save(
                    collection,
                    {
                      id: String(found.entry.id),
                      version: (found.entry as { version?: number }).version ?? 0,
                    },
                    patch,
                  )
                }
              }
            }
          }}
        />
      )}

      {specs && kind && editor.creating && (
        <EntityDialog
          open
          onOpenChange={editor.close}
          title={`Add ${kind.title.replace(/s$/, '').toLowerCase()}`}
          collection={kind.collection}
          form={formSpec(specs, kind.form)}
          references={references}
          onCreate={(fields) => {
            save(kind, null, fields)
          }}
        />
      )}

      {specs && editor.editing && (
        <EntityDialog
          // Remounted per row: the draft is the dialog's own state, so one
          // kept mounted across two rows shows the first row's values.
          key={String(editor.editing.entry.id)}
          open
          onOpenChange={editor.close}
          title={`Edit ${editor.editing.kind.title.replace(/s$/, '').toLowerCase()}`}
          collection={editor.editing.kind.collection}
          form={formSpec(specs, editor.editing.kind.form)}
          references={references}
          entry={editor.editing.entry}
          onCreate={(fields) => {
            const open_ = editor.editing
            if (open_) save(open_.kind, open_.entry, fields)
          }}
        />
      )}

      <ConfirmDeleteDialog
        ids={deleting}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null)
        }}
        onConfirm={() => {
          if (refuseDelete) return refuseDelete()
          remove(deleting ?? [])
          return undefined
        }}
        title={(count) =>
          count === 1 ? 'Delete this entity?' : `Delete ${String(count)} entities?`
        }
        consequence="They go in one step, whichever tables they are in."
      />
    </Section>
  )
}

/**
 * The scope row: every kind, with how many rows the search leaves in each.
 *
 * Buttons rather than links: the scope is this block's own state, so pressing
 * one stays on the page. The counts answer the search rather than the table.
 */
function ScopeRow({
  scope,
  counts,
  onScope,
}: {
  scope: EntityScope
  counts: readonly EntityRowView[]
  onScope: (next: EntityScope) => void
}) {
  const tab = (value: EntityScope, title: string, count: number) => (
    <Button
      key={value}
      variant="ghost"
      size="sm"
      {...(scope === value ? { 'aria-current': 'page' as const } : {})}
      className={cn(
        'h-auto rounded-none border-b-2 px-0 py-1.5 text-sm font-normal hover:bg-transparent',
        scope === value
          ? 'border-primary font-semibold text-ink'
          : 'border-transparent text-ink-muted hover:text-ink',
      )}
      onPress={() => {
        onScope(value)
      }}
    >
      {title}
      <span className="text-2xs tabular-nums text-ink-muted">{count}</span>
    </Button>
  )

  return (
    <nav aria-label="Scope" className="flex flex-wrap items-baseline gap-x-5">
      {tab('all', 'All entities', counts.length)}
      {ENTITY_KINDS.map((entry) =>
        tab(entry.slug, entry.title, counts.filter((row) => row.slug === entry.slug).length),
      )}
    </nav>
  )
}

interface BodyProps {
  scope: EntityScope
  kase: Case
  specs: Specs
  rows: readonly EntityRowView[]
  total: number
  narrowed: boolean
  highlightId: string | undefined
  onOpen: (row: EntityRowView) => void
  onScope: (next: EntityScope) => void
  onDelete: (ids: string[]) => void
  onEdit: (id: string) => void
  onBulkApply: (
    slug: EntityKind['slug'],
    ids: readonly string[],
    patch: Record<string, unknown>,
  ) => void
}

/** The kind's own table, or the generic five when nothing is scoped. */
function ScopeBody(props: BodyProps) {
  switch (props.scope) {
    case 'all':
      return <MixedTable {...props} />
    case 'assets':
      return <KindTable {...props} rowsOf={(kase) => kase.systems} columns={systemColumns} />
    case 'accounts':
      return <KindTable {...props} rowsOf={(kase) => kase.accounts} columns={accountColumns} />
    case 'network':
      return (
        <KindTable {...props} rowsOf={(kase) => kase.networkIndicators} columns={networkColumns} />
      )
    case 'malware':
      return <KindTable {...props} rowsOf={(kase) => kase.malware} columns={malwareColumns} />
    case 'cloud-apps':
      return <KindTable {...props} rowsOf={(kase) => kase.cloudApps} columns={cloudAppColumns} />
  }
}

/**
 * What the words say when a table has nothing in it, and why.
 *
 * A filter matching nothing is fixed by dropping a filter rather than by
 * opening another screen, so `offers` is drawn only when the case is genuinely
 * empty.
 */
function tableEmpty(narrowed: boolean, what: string, offers?: readonly EmptyOffer[]): ReactNode {
  return (
    <EmptyState
      title={narrowed ? 'Nothing matches' : `No ${what} yet`}
      detail={
        narrowed
          ? 'Drop a filter or shorten the search.'
          : `${what[0]?.toUpperCase() ?? ''}${what.slice(1)} appear here as they are added.`
      }
      {...(!narrowed && offers ? { offers } : {})}
    />
  )
}

/**
 * Every kind at once, on the five columns they all project onto.
 *
 * What the five shared columns had no room for: the entry's stored fields.
 * A kind's row *is* the entry, so the bag handed here carries the storage
 * bookkeeping too - `StoredFacts` is what keeps `version` and the timestamps
 * out of a panel that is otherwise about the incident.
 */
function MixedTable({
  specs,
  rows,
  narrowed,
  highlightId,
  onOpen,
  onScope,
  onDelete,
  onEdit,
}: BodyProps) {
  const columns = useMemo(() => entityColumns(specs.fieldTones, onOpen), [specs.fieldTones, onOpen])
  const table = useEntityTable<EntityRowView>({
    data: rows as EntityRowView[],
    columns,
    enableExpanding: true,
    meta: {
      pendingIds: new Set(),
      commit: () => undefined,
      remove: (id) => {
        onDelete([id])
      },
      edit: onEdit,
    },
  })
  return (
    <>
      <div className="mb-2 flex justify-end">
        <BulkActionBar
          table={table}
          // **No bulk edit across kinds, and that is the answer rather than a
          // gap.** A selection here can hold a system and a cloud app, which
          // share no field; the bar keeps its count and its Delete.
          fields={[]}
          onApply={() => undefined}
          onRequestDelete={onDelete}
        />
      </div>
      <DataTable
        table={table}
        // The pane scrolls, not the table: this is the case's whole entity
        // list rather than one section's.
        scroll="page"
        className="[&_table]:min-w-[56rem]"
        label="Every entity in this case"
        renderExpanded={(row) => <StoredFacts fields={row.original.fields} />}
        {...(highlightId ? { highlightId } : {})}
        empty={tableEmpty(
          narrowed,
          'entities',
          // The kinds this screen is a roll-up of, drawn from the same list
          // the scope row is, so a sixth kind appears here without an edit.
          ENTITY_KINDS.map((entry) => ({
            label: entry.title,
            onSelect: () => {
              onScope(entry.slug)
            },
          })),
        )}
      />
    </>
  )
}

/** One kind, on its own columns, narrowed by the ids the search left. */
function KindTable<TData extends { id: string }>({
  kase,
  specs,
  rows,
  narrowed,
  highlightId,
  scope,
  onDelete,
  onEdit,
  onBulkApply,
  rowsOf,
  columns: build,
}: BodyProps & {
  rowsOf: (kase: Case) => readonly TData[]
  columns: (kase: Case, specs: Specs) => EntityColumn<TData>[]
}) {
  const kept = new Set(rows.map((row) => row.id))
  const data = rowsOf(kase).filter((row) => kept.has(row.id))
  const columns = useMemo(() => build(kase, specs), [build, kase, specs])
  const kind = kindFor(scope)
  /**
   * The served form's own closed vocabularies, so setting a verdict across a
   * selection offers exactly what the dialog offers.
   */
  const bulkFields = useMemo<BulkField<TData>[]>(
    () => (kind ? bulkFieldsFor(formSpec<TData>(specs, kind.form)) : []),
    [kind, specs],
  )
  const table = useEntityTable<TData>({
    data,
    columns,
    // **The same row must open whichever scope reached it.** Only the mixed
    // table had this, so an account expanded under *All entities* and could
    // not under *Accounts* -- and an absent control reads as a row with
    // nothing more to show rather than as a table missing a capability.
    enableExpanding: true,
    meta: {
      pendingIds: new Set(),
      // A cell's own edit is one field of one row, which is the same write the
      // bulk bar makes over many.
      commit: (id, fields) => {
        if (kind) onBulkApply(kind.slug, [id], fields)
      },
      remove: (id) => {
        onDelete([id])
      },
      edit: onEdit,
      ...(kind ? { collection: kind.collection } : {}),
    },
  })
  return (
    <>
      <div className="mb-2 flex justify-end">
        <BulkActionBar
          table={table}
          fields={bulkFields}
          onApply={(ids, patch) => {
            if (kind) onBulkApply(kind.slug, ids, patch)
          }}
          onRequestDelete={onDelete}
        />
      </div>
      <DataTable
        table={table}
        scroll="page"
        className="[&_table]:min-w-[56rem]"
        label={kind?.title ?? 'Entities'}
        renderExpanded={(row) => <StoredFacts fields={row.original} />}
        {...(highlightId ? { highlightId } : {})}
        empty={tableEmpty(narrowed, (kind?.title ?? 'entities').toLowerCase())}
      />
    </>
  )
}

/**
 * The mixed table's columns.
 *
 * Nothing is filled and nothing shouts: state is a dot and a word, and the dot
 * is the only colour. Mono is for what an analyst would copy, which is the
 * identity and the resolved reference and nothing else.
 *
 * `identity` carries no width on purpose: fixed layout hands the remainder to
 * the one column that declares none, and if every column declared one the
 * leftover would land on the checkbox.
 *
 * One cell's content, centred against a row whose height the table sets.
 */
function entityColumns(
  fieldTones: Specs['fieldTones'],
  onOpen: (row: EntityRowView) => void,
): EntityColumn<EntityRowView>[] {
  return [
    {
      ...selectionColumn<EntityRowView>((row) => `Select ${row.identity}`),
      meta: { className: 'w-10 align-middle' },
    },
    {
      accessorKey: 'kind',
      header: 'Kind',
      meta: { className: 'w-[10%]' },
      cell: ({ row }) => (
        <div className="flex items-center">
          <span className="truncate text-ink-muted">{row.original.kind}</span>
        </div>
      ),
    },
    {
      accessorKey: 'identity',
      header: 'Identity',
      cell: ({ row }) => (
        <div className="flex items-center">
          {row.original.identity ? (
            <Button
              variant="link"
              size="sm"
              className="-mx-2 h-auto max-w-full justify-start truncate px-2 py-1 font-mono text-data font-medium"
              onPress={() => {
                onOpen(row.original)
              }}
            >
              <span className="truncate">{row.original.identity}</span>
            </Button>
          ) : (
            <Absent />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'state',
      header: 'State',
      meta: { className: 'w-[13%]' },
      cell: ({ row }) => (
        <div className="flex items-center">
          {row.original.state ? (
            <FieldToneBadge value={row.original.state} tone={toneOf(row.original, fieldTones)} />
          ) : (
            <Absent />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'linked',
      header: 'Linked',
      meta: { className: 'w-[16%]' },
      cell: ({ row }) => (
        <div className="flex items-center">
          {row.original.linked ? (
            <span className="truncate font-mono text-data text-ink-muted">
              {row.original.linked}
            </span>
          ) : (
            <Absent />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'detail',
      header: 'Detail',
      meta: { className: 'w-[24%]' },
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 overflow-hidden">
          {row.original.detailParts.length === 0 ? (
            <Absent />
          ) : (
            row.original.detailParts.map((part, index) => {
              const tone = part.field
                ? fieldTones[part.field]?.[part.value.trim().toLowerCase()]
                : undefined
              const { role } = paintFor(tone)
              return (
                <span key={part.field ?? index} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 && (
                    <span aria-hidden className="text-ink-muted/50">
                      &#xB7;
                    </span>
                  )}
                  <span className={cn('truncate', tone ? ROLE_INK[role] : 'text-ink-muted')}>
                    {part.value}
                  </span>
                </span>
              )
            })
          )}
        </div>
      ),
    },
    {
      accessorKey: 'source',
      header: 'Source',
      meta: { className: 'w-[10%]' },
      cell: ({ row }) => (
        <div className="flex items-center">
          <span className="truncate text-ink-muted">{row.original.source || '\u2014'}</span>
        </div>
      ),
    },
    actionsColumn<EntityRowView>((row) => row.identity || 'entry'),
  ]
}

/**
 * The served label for a field, shortened, with the header this table needs.
 *
 * A form's label is the question asked while filling the field in; a column
 * header is scanned down thirty rows, so a few are named here instead.
 */
function labelled<TData>(
  form: FormSpec<TData>,
  overrides: Readonly<Record<string, string>>,
): (name: string) => string {
  return (name) => overrides[name] ?? shortLabel(fieldOf(form, name)?.label ?? name)
}

/** A tone chip where the server maps one, plain text where it does not. */
function paintTone(
  value: string,
  tones: Readonly<Record<string, FieldToneSpec>> | undefined,
): ReactNode {
  if (!value) return <Absent />
  return tones ? (
    <FieldToneBadge value={value} tone={tones[value.trim().toLowerCase()]} />
  ) : (
    <span className="text-xs">{value}</span>
  )
}

function systemColumns(_kase: Case, specs: Specs): EntityColumn<SystemEntry>[] {
  const form = formSpec<SystemEntry>(specs, 'SYSTEM_FIELDS')
  const label = labelled(form, { hostname: 'Hostname', source: 'Source' })
  const cell = (field: keyof SystemEntry, view?: (value: string) => ReactNode) =>
    ({
      accessorKey: field,
      header: label(field),
      cell: ({ row, table }) => (
        <TextCell
          row={row}
          table={table}
          field={field}
          label={label(field)}
          {...(view ? { view } : {})}
        />
      ),
    }) as EntityColumn<SystemEntry>

  return [
    selectionColumn<SystemEntry>((row) => `Select ${row.hostname}`),
    { ...cell('hostname'), meta: { className: 'w-[24%]' } },
    { ...cell('systemType'), meta: { className: 'w-[14%]' } },
    {
      // **`isolated` beside the verdict, not only in its own column.** It is a
      // boolean rather than a classification, and what an analyst needs to see
      // is that a compromised host has been taken off the network -- which is
      // only readable next to the verdict.
      //
      // The pair wraps rather than taking a wider column: it needs 155px and
      // this one is 111px by a 900px pane, so side by side it spilled into the
      // neighbouring column, which the cell's visible overflow carried it into.
      // A second line costs height on the rows that have a badge, and keeps the
      // adjacency above.
      ...cell('verdict', (value) => paintTone(value, specs.fieldTones.verdict)),
      meta: { className: 'w-[15%]' },
      cell: ({ row, table }) => (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
          <SelectCell
            row={row}
            table={table}
            field="verdict"
            label={label('verdict')}
            view={(value) => paintTone(value, specs.fieldTones.verdict)}
          />
          {row.original.isolated && (
            <FieldToneBadge value="isolated" tone={specs.fieldTones.isolated?.true} />
          )}
        </span>
      ),
    },
    { ...cell('zone'), meta: { className: 'w-[13%]' } },
    {
      ...cell('analysisStatus', (value) => paintTone(value, specs.fieldTones.analysisStatus)),
      meta: { className: 'w-[17%]' },
    },
    {
      accessorKey: 'isolated',
      header: label('isolated'),
      meta: { className: 'w-28' },
      enableSorting: false,
      cell: ({ row, table }) => (
        <BooleanCell row={row} table={table} field="isolated" label={label('isolated')} />
      ),
    },
    actionsColumn<SystemEntry>((row) => row.hostname || 'system'),
  ]
}

function accountColumns(_kase: Case, specs: Specs): EntityColumn<AccountEntry>[] {
  const form = formSpec<AccountEntry>(specs, 'ACCOUNT_FIELDS')
  const label = labelled(form, { domain: 'Account domain', source: 'Source' })
  const cell = (field: keyof AccountEntry, width: string) =>
    ({
      accessorKey: field,
      header: label(field),
      meta: { className: width },
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field={field} label={label(field)} />
      ),
    }) as EntityColumn<AccountEntry>

  return [
    selectionColumn<AccountEntry>((row) => `Select ${row.accountName}`),
    cell('accountName', 'w-[24%]'),
    cell('domain', 'w-[16%]'),
    cell('privileges', 'w-[16%]'),
    cell('lastActivity', 'w-[16%]'),
    {
      accessorKey: 'disabled',
      header: label('disabled'),
      meta: { className: 'w-20' },
      enableSorting: false,
      cell: ({ row, table }) => (
        <BooleanCell row={row} table={table} field="disabled" label={label('disabled')} />
      ),
    },
    {
      accessorKey: 'source',
      header: label('source'),
      cell: ({ row }) => (
        <span className="text-xs text-ink-muted">{row.original.source || '\u2014'}</span>
      ),
    },
    actionsColumn<AccountEntry>((row) => row.accountName || 'account'),
  ]
}

function networkColumns(kase: Case, specs: Specs): EntityColumn<NetworkIndicator>[] {
  const form = formSpec<NetworkIndicator>(specs, 'NETWORK_FIELDS')
  const label = labelled(form, { systemId: 'Host', source: 'Source' })
  const names = entityNames(kase)
  const cell = (
    field: keyof NetworkIndicator,
    width: string,
    view?: (value: string) => ReactNode,
  ) =>
    ({
      accessorKey: field,
      header: label(field),
      meta: { className: width },
      cell: ({ row, table }) => (
        <TextCell
          row={row}
          table={table}
          field={field}
          label={label(field)}
          {...(view ? { view } : {})}
        />
      ),
    }) as EntityColumn<NetworkIndicator>

  return [
    selectionColumn<NetworkIndicator>((row) => `Select ${row.value}`),
    cell('type', 'w-[8%]'),
    cell('value', 'w-[14%]'),
    cell('scope', 'w-[8%]'),
    cell('port', 'w-[6%]'),
    {
      accessorKey: 'systemId',
      header: label('systemId'),
      meta: { className: 'w-[12%]' },
      cell: ({ row, table }) => (
        <ReferenceCell
          row={row}
          table={table}
          field="systemId"
          label={label('systemId')}
          options={names.system}
          target={fieldOf(form, 'systemId')?.ref?.target ?? ''}
        />
      ),
    },
    { ...cell('context', 'w-[14%]'), enableSorting: false },
    cell('disposition', 'w-[10%]', (value) => paintTone(value, specs.fieldTones.disposition)),
    cell('triage', 'w-[10%]', (value) => paintTone(value, specs.fieldTones.triage)),
    {
      accessorKey: 'blocked',
      header: label('blocked'),
      meta: { className: 'w-[6%]' },
      enableSorting: false,
      cell: ({ row, table }) => (
        <BooleanCell row={row} table={table} field="blocked" label={label('blocked')} />
      ),
    },
    actionsColumn<NetworkIndicator>((row) => row.value || 'indicator'),
  ]
}

function malwareColumns(kase: Case, specs: Specs): EntityColumn<MalwareEntry>[] {
  const form = formSpec<MalwareEntry>(specs, 'MALWARE_FIELDS')
  const label = labelled(form, { systemId: 'System', source: 'Source' })
  const names = entityNames(kase)

  return [
    selectionColumn<MalwareEntry>((row) => `Select ${row.filename}`),
    {
      accessorKey: 'filename',
      header: label('filename'),
      meta: { className: 'w-[17%]' },
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field="filename" label={label('filename')} />
      ),
    },
    {
      accessorKey: 'family',
      header: label('family'),
      meta: { className: 'w-[13%]' },
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field="family" label={label('family')} />
      ),
    },
    {
      accessorKey: 'systemId',
      header: label('systemId'),
      meta: { className: 'w-[15%]' },
      cell: ({ row, table }) => (
        <ReferenceCell
          row={row}
          table={table}
          field="systemId"
          label={label('systemId')}
          options={names.system}
          target={fieldOf(form, 'systemId')?.ref?.target ?? ''}
        />
      ),
    },
    {
      accessorKey: 'accountId',
      header: label('accountId'),
      meta: { className: 'w-[15%]' },
      cell: ({ row, table }) => (
        <ReferenceCell
          row={row}
          table={table}
          field="accountId"
          label={label('accountId')}
          options={names.account}
          target={fieldOf(form, 'accountId')?.ref?.target ?? ''}
        />
      ),
    },
    {
      // Fixed layout percentages are of the table, so a wider window scales
      // the truncation rather than curing it: this cell clips at 1280 and at
      // 1440 alike. The expanded row is where the whole digest is readable.
      accessorKey: 'hash',
      header: label('hash'),
      meta: { className: 'w-[17%]' },
      cell: ({ row, table }) => (
        <TextCell
          row={row}
          table={table}
          field="hash"
          label={label('hash')}
          view={(value) => <span className="font-mono text-data">{value || '\u2014'}</span>}
        />
      ),
    },
    {
      accessorKey: 'verdict',
      header: label('verdict'),
      meta: { className: 'w-[13%]' },
      cell: ({ row, table }) => (
        <SelectCell
          row={row}
          table={table}
          field="verdict"
          label={label('verdict')}
          view={(value) => paintTone(value, specs.fieldTones.verdict)}
        />
      ),
    },
    actionsColumn<MalwareEntry>((row) => row.filename || 'malware'),
  ]
}

function cloudAppColumns(kase: Case, specs: Specs): EntityColumn<CloudAppEntry>[] {
  const form = formSpec<CloudAppEntry>(specs, 'CLOUD_APP_FIELDS')
  const label = labelled(form, { accountId: 'Account', source: 'Source' })
  const names = entityNames(kase)
  const cell = (field: keyof CloudAppEntry, width: string) =>
    ({
      accessorKey: field,
      header: label(field),
      meta: { className: width },
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field={field} label={label(field)} />
      ),
    }) as EntityColumn<CloudAppEntry>

  return [
    selectionColumn<CloudAppEntry>((row) => `Select ${row.appName}`),
    cell('appName', 'w-[18%]'),
    cell('instance', 'w-[13%]'),
    cell('publisher', 'w-[13%]'),
    cell('consentType', 'w-[13%]'),
    cell('verifiedPublisher', 'w-[13%]'),
    {
      accessorKey: 'accountId',
      header: label('accountId'),
      meta: { className: 'w-[15%]' },
      cell: ({ row, table }) => (
        <ReferenceCell
          row={row}
          table={table}
          field="accountId"
          label={label('accountId')}
          options={names.account}
          target={fieldOf(form, 'accountId')?.ref?.target ?? ''}
        />
      ),
    },
    actionsColumn<CloudAppEntry>((row) => row.appName || 'cloud app'),
  ]
}

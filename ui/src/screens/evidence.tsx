import { useMemo, useState, type ReactNode } from 'react'

import type { Case, EvidenceEntry } from '@/api/model'
import { fieldOf, formSpec, shortLabel, type Specs } from '@/api/specs'
import { BulkActionBar, bulkFieldsFor } from '@/components/blocks/bulk-actions'
import { Collection } from '@/components/blocks/collection'
import { ConfirmDeleteDialog } from '@/components/blocks/confirm-delete-dialog'
import { ReferenceCell, TextCell } from '@/components/blocks/data-cell'
import { StoredFacts } from '@/components/blocks/detail-grid'
import {
  actionsColumn,
  selectionColumn,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { FileSlot } from '@/components/blocks/file-slot'
import { EntityDialog } from '@/components/blocks/entity-dialog'
import { useFilters } from '@/components/blocks/filter-set'
import { FieldToneBadge, held } from '@/components/blocks/severity-badge'
import { AddAction } from '@/components/blocks/section-head'

import { entityNames, referenceOptions } from '@/components/blocks/entity-scope'
import { localId, useRowEditor } from '@/components/blocks/row-editing'
import { matchesRecord } from './evidence-rows'

/** The evidence register: what this case has collected, and what it has only
 *  promised. */
/**
 * Where this screen's writes go when something is serving it.
 *
 * Each call resolves with the row the server stored, and that is what the
 * list is updated from -- never a copy this screen merged itself.
 *
 * `save` carries the file separately from the fields -- the dialog's spec does
 * not describe it, and a container needs the bytes rather than the metadata
 * this screen would derive from them.
 */
export interface EvidenceWrites {
  /** `entry` null creates. Resolves with the stored row. */
  save: (
    entry: EvidenceEntry | null,
    fields: Partial<EvidenceEntry>,
    file: File | null,
  ) => Promise<EvidenceEntry>
  /** One patch across a named selection. Resolves with the stored rows. */
  patch: (
    ids: readonly string[],
    fields: Partial<EvidenceEntry>,
  ) => Promise<readonly EvidenceEntry[]>
  remove: (ids: readonly string[]) => Promise<void>
}

export interface EvidenceScreenProps {
  kase: Case | undefined
  specs: Specs | undefined
  /** What the search box opens with. */
  search?: string
  /**
   * The register is still being read.
   *
   * The screen draws no rows and no empty state while this holds: "No evidence
   * recorded" is an answer, and a read that has not returned does not have one.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
  /**
   * Omitted in the gallery, where a save changes this screen's own list and
   * nothing else.
   *
   * Supplied, every write leaves and the list is updated from the row that
   * comes back -- never from a copy merged before the server answered.
   */
  writes?: EvidenceWrites
}

/** The fields a column could be built from, in the order the table shows them. */
const OPTIONAL_COLUMNS = ['type', 'systemId', 'location', 'hash', 'dataClassification'] as const
type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]

/** Stable, so the gallery's table meta does not change identity every render. */
const EMPTY_PENDING: ReadonlySet<string> = new Set()

type EvidenceState = 'promised' | 'collected'
const STATES: readonly EvidenceState[] = ['promised', 'collected']

/** Derived, never stored: a stored state is the one that is wrong after a
 *  failed upload. */
function stateOf(entry: EvidenceEntry): EvidenceState {
  return entry.storedAt ? 'collected' : 'promised'
}

/**
 * The optional columns something in this case fills.
 *
 * Against the whole collection, never the filtered rows: narrowing to one
 * record would take out every column that record happens to leave blank, and
 * the grid would rearrange itself under a search.
 */
function shownColumns(rows: readonly EvidenceEntry[]): Set<OptionalColumn> {
  return new Set(
    OPTIONAL_COLUMNS.filter((field) => rows.some((row) => (row[field] ?? '').trim() !== '')),
  )
}

/** First six and last four: two digests that differ share a long prefix often
 *  enough that a leading slice alone is not a comparison. */
function shortHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 6)}\u2026${hash.slice(-4)}` : hash
}

/**
 * What a file says about itself, once a record is carrying one.
 *
 * The gallery's answer only. A container gets the bytes and lets the server
 * decide: `storedAt` set here would read as collected the moment an upload
 * failed.
 */
function collectedFrom(file: File | null): Partial<EvidenceEntry> {
  if (!file) return {}
  return {
    originalFilename: file.name,
    sizeBytes: file.size,
    contentType: file.type || null,
    storedAt: new Date().toISOString(),
  }
}

/** The register answering itself, which is what a story is. Implements the
 *  same interface a container does. */
function galleryWrites(): EvidenceWrites {
  return {
    save: (entry, fields, file) =>
      Promise.resolve(
        entry
          ? { ...entry, ...fields, ...collectedFrom(file) }
          : { ...BLANK_EVIDENCE, ...fields, ...collectedFrom(file), id: localId('evidence') },
      ),
    patch: (ids, fields) =>
      Promise.resolve(ids.map((id) => ({ ...BLANK_EVIDENCE, ...fields, id }))),
    remove: () => Promise.resolve(),
  }
}

export function EvidenceScreen({
  kase,
  specs,
  search = '',
  busy = false,
  problem,
  onRetry,
  writes,
}: EvidenceScreenProps) {
  /**
   * The register, and the one place it comes from.
   *
   * Held rather than read straight off `kase` because a write updates it from
   * the row the server stored, before the case the container is holding has
   * been re-read. **Re-synced whenever a new case arrives**, which is what
   * makes another analyst's write repaint this screen: the container hands
   * down the query's object, and a changed identity replaces these rows.
   *
   * The same shape as `actions`, `impact` and `timeline`. It was
   * `useAsyncList` here, which loads once on mount and refreshes only through
   * a `reload` this screen kept to itself -- so a socket-driven invalidation
   * had no way in, and a case open on two screens quietly disagreed.
   */
  const [rows, setRows] = useState(kase?.evidence ?? [])
  const [given, setGiven] = useState(kase)
  if (given !== kase) {
    setGiven(kase)
    setRows(kase?.evidence ?? [])
  }

  /** One write path. Omitted, the gallery answers for itself. */
  const write = writes ?? galleryWrites()

  /** A write in flight, so the row it touches reads as busy. */
  const [writing, setWriting] = useState<ReadonlySet<string>>(EMPTY_PENDING)

  /**
   * Marks rows busy for the length of one write, and clears them however it
   * ends. Deliberately does not catch: a rejected write leaves the list
   * untouched, and the refusal belongs to whoever supplied `writes`.
   */
  const inFlight = async (ids: readonly string[], run: () => Promise<void>) => {
    setWriting(new Set(ids))
    try {
      await run()
    } finally {
      setWriting(EMPTY_PENDING)
    }
  }

  const [query, setQuery] = useState(search)
  const [deleting, setDeleting] = useState<string[] | null>(null)
  const editor = useRowEditor<EvidenceEntry>()
  /**
   * The file the open dialog is carrying, if any.
   *
   * Cleared whenever the dialog opens or closes: a file left behind attaches
   * itself to the next record, which is a wrong artefact on a real record and
   * reads as correct.
   */
  const [attached, setAttached] = useState<File | null>(null)

  const names = useMemo(
    () =>
      kase
        ? entityNames(kase)
        : { system: new Map<string, string>(), account: new Map<string, string>() },
    [kase],
  )
  const shown = useMemo(() => shownColumns(rows), [rows])
  const kinds = useMemo(
    () => [...new Set(rows.map((row) => row.type).filter(Boolean))].sort(),
    [rows],
  )

  const counts = useMemo(
    () => ({
      promised: rows.filter((row) => stateOf(row) === 'promised').length,
      collected: rows.filter((row) => stateOf(row) === 'collected').length,
    }),
    [rows],
  )

  const filters = useFilters([
    {
      key: 'state',
      label: 'State',
      options: STATES.map((state) => ({ value: state, count: counts[state] })),
    },
    {
      key: 'type',
      label: 'Type',
      options: kinds.map((type) => ({
        value: type,
        count: rows.filter((row) => row.type === type).length,
      })),
    },
  ])
  const states = filters.chosen('state')
  const types = filters.chosen('type')

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (!matchesRecord(row, query)) return false
        if (states.length && !states.includes(stateOf(row))) return false
        if (types.length && !types.includes(row.type)) return false
        return true
      }),
    [rows, query, states, types],
  )

  const columns = useMemo(
    () => (specs ? evidenceColumns(specs, shown, names.system) : []),
    [specs, shown, names],
  )
  const bulkFields = useMemo(
    () => (specs ? bulkFieldsFor(formSpec<EvidenceEntry>(specs, 'EVIDENCE_FIELDS')) : []),
    [specs],
  )
  /** The fields the grid is drawing, which the panel under it must not repeat. */
  const columned = useMemo(
    () => ['name', ...OPTIONAL_COLUMNS.filter((field) => shown.has(field))],
    [shown],
  )
  const table = useEntityTable<EvidenceEntry>({
    data: visible,
    columns,
    // **A record stores about twice what the grid can show**, and which half
    // is on screen changes with the case: `shownColumns` drops a column no
    // record fills, so the panel's own omissions are computed from the same
    // set rather than listed.
    enableExpanding: true,
    meta: {
      pendingIds: writing,
      /*
       * Unreachable in this tier: no aria block edits a cell in place, so
       * evidence has no inline edit for `commit` to serve. The table's meta
       * requires the field regardless. The day one does, this needs the
       * same wait-for-the-server shape as `save`.
       */
      commit: (id, fields) => {
        setRows((was) => was.map((row) => (row.id === id ? { ...row, ...fields } : row)))
      },
      // Delete asks before it acts either way -- the confirmation is the
      // screen's, and only the answer leaves.
      remove: (id) => {
        setDeleting([id])
      },
      edit: (id) => {
        const found = rows.find((row) => row.id === id)
        if (found) editor.edit(found)
      },
      collection: 'evidence',
    },
  })

  /** The dialog's answer, written into this screen's copy of the register.
   *  A record with no file keeps `storedAt` null and reads as promised. */
  const save = (entry: EvidenceEntry | null, fields: Partial<EvidenceEntry>) => {
    // The bytes go out, not what this screen would derive from them.
    const file = attached
    // **Answered, not fired and forgotten.** The dialog closes itself when
    // this resolves; closing here would throw the draft and the chosen file
    // away before the server had answered for either. What is dropped on the
    // way out is dropped once the write has landed.
    return inFlight(entry ? [entry.id] : [], async () => {
      const stored = await write.save(entry, fields, file)
      setRows((was) =>
        entry ? was.map((row) => (row.id === entry.id ? stored : row)) : [...was, stored],
      )
      setAttached(null)
    })
  }

  /** Shut the dialog and drop whatever it was carrying. */
  const closeDialog = () => {
    setAttached(null)
    editor.close()
  }

  return (
    <Collection
      title="Evidence"
      meta={`${String(counts.collected)} collected, ${String(counts.promised)} promised`}
      /* One door: the file is a choice inside it rather than a separate
         flow, since which kind of record this is is often not known until
         the form is filled in. Nothing clears on the way in -- `closeDialog`
         is the only way out, so the slot is already empty. */
      actions={<AddAction label="Add record" onPress={editor.add} />}
      search={{
        column: evidenceLabel(specs, 'name'),
        placeholder: "A record's name",
        value: query,
        onValue: setQuery,
      }}
      filters={filters}
      toolbarEnd={
        <BulkActionBar
          table={table}
          fields={bulkFields}
          onApply={(ids, fields) => {
            void inFlight(ids, async () => {
              for (const stored of await write.patch(ids, fields)) {
                setRows((was) => was.map((row) => (row.id === stored.id ? stored : row)))
              }
            })
          }}
          onRequestDelete={setDeleting}
        />
      }
      /* **The list's three states, and the block already draws all of them.**
         Without this the first frame reads "No evidence recorded" -- the empty
         state answering a question the read has not returned from -- and a
         failed read renders the same lie permanently. All three arrive as
         props, since the container is what knows any of them. */
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
      table={{
        table,
        scroll: 'page',
        className: '[&_table]:min-w-[52rem]',
        label: 'Evidence records',
        renderExpanded: (row) => (
          <StoredFacts
            fields={row.original}
            omit={columned}
            table="evidence"
            entryId={row.original.id}
          />
        ),
      }}
      empty={{
        title: 'No evidence recorded',
        detail:
          'A record can be added before the file is collected; it reads as promised until the bytes arrive.',
      }}
    >
      <ConfirmDeleteDialog
        ids={deleting}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null)
        }}
        onConfirm={() => {
          const doomed = deleting ?? []
          table.resetRowSelection()
          void inFlight(doomed, async () => {
            await write.remove(doomed)
            setRows((was) => was.filter((row) => !doomed.includes(row.id)))
          })
        }}
        title={(count) =>
          count === 1 ? 'Delete this record?' : `Delete ${String(count)} records?`
        }
        consequence="The record goes; a file already collected stays on disk."
      />

      {kase && specs && (editor.creating || editor.editing) && (
        <EntityDialog
          key={editor.editing?.id ?? 'new'}
          open
          onOpenChange={closeDialog}
          collection="evidence"
          lead={
            <FileSlot
              file={attached}
              onFile={setAttached}
              label="Drop the collected file here"
              description="Without one the record reads as promised."
            />
          }
          title={editor.editing ? 'Edit record' : 'Add record'}
          form={formSpec<EvidenceEntry>(specs, 'EVIDENCE_FIELDS')}
          // Every collection `EVIDENCE_FIELDS` can reference, not just the
          // two this screen already had names for: `methodId` points at
          // `methods`, and a reference field with no options draws every
          // chip as "(missing reference)".
          references={referenceOptions(kase)}
          {...(editor.editing ? { entry: editor.editing } : {})}
          onCreate={(fields) => save(editor.editing, fields)}
        />
      )}
    </Collection>
  )
}

/**
 * What a record carries that the served form does not ask for.
 *
 * `storedAt` above all: it is what `stateOf` reads, and a record added here is
 * a promise until the bytes arrive.
 */
const BLANK_EVIDENCE: Omit<EvidenceEntry, 'id'> = {
  version: 1,
  name: '',
  type: '',
  location: '',
  collectedBy: '',
  collectedAt: null,
  acquisitionTool: '',
  dataClassification: '',
  systemId: null,
  accountId: null,
  methodId: null,
  tags: '',
  hash: '',
  hashAlgorithm: null,
  storedAt: null,
  sizeBytes: null,
  contentType: null,
  originalFilename: '',
}

/** The state, painted by the component every entity table paints with. */
function StateCell({ entry }: { entry: EvidenceEntry }) {
  const state = stateOf(entry)
  return (
    <FieldToneBadge
      value={state}
      // The server maps no tone for a field it does not store: `good` for
      // collected, `warn` for a promise, which is outstanding rather than wrong.
      tone={state === 'collected' ? held('low', 'hollow') : held('medium', 'hollow')}
      className="whitespace-nowrap"
    />
  )
}

/**
 * One field's column heading.
 *
 * The toolbar's badge reads the same call the column header does, so the badge
 * cannot come to name a heading the table has stopped drawing.
 */
function evidenceLabel(specs: Specs | undefined, name: string): string {
  const overrides: Record<string, string> = { name: 'Name', systemId: 'Host' }
  const served = specs
    ? shortLabel(fieldOf(formSpec<EvidenceEntry>(specs, 'EVIDENCE_FIELDS'), name)?.label ?? name)
    : name
  return overrides[name] ?? served
}

function evidenceColumns(
  specs: Specs,
  shown: ReadonlySet<OptionalColumn>,
  systems: ReadonlyMap<string, string>,
): EntityColumn<EvidenceEntry>[] {
  const form = formSpec<EvidenceEntry>(specs, 'EVIDENCE_FIELDS')
  const label = (name: string) => evidenceLabel(specs, name)

  const text = (field: OptionalColumn, width: string, view?: (value: string) => ReactNode) =>
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
    }) as EntityColumn<EvidenceEntry>

  const optional: Record<OptionalColumn, EntityColumn<EvidenceEntry>> = {
    // Clips itself, as a `view` rendering bare text has to: `TextCell`
    // withholds `truncate` from a view deliberately.
    type: text('type', 'w-[14%]', (value) => (
      <span className="block truncate text-ink-muted">{value || '\u2014'}</span>
    )),
    systemId: {
      accessorKey: 'systemId',
      header: label('systemId'),
      meta: { className: 'w-[14%]' },
      cell: ({ row, table }) => (
        <ReferenceCell
          row={row}
          table={table}
          field="systemId"
          label={label('systemId')}
          options={systems}
          target={fieldOf(form, 'systemId')?.ref?.target ?? ''}
        />
      ),
    },
    location: text('location', 'w-[18%]'),
    hash: {
      id: 'hash',
      accessorFn: (row) => row.hash,
      header: 'Hash',
      meta: { className: 'w-[12%]' },
      enableSorting: false,
      cell: ({ row }) => (
        <span
          className="block truncate font-mono text-data text-ink-muted"
          title={row.original.hash || undefined}
        >
          {shortHash(row.original.hash) || '\u2014'}
        </span>
      ),
    },
    dataClassification: text('dataClassification', 'w-[12%]'),
  }

  return [
    selectionColumn<EvidenceEntry>((row) => `Select ${row.name}`),
    {
      id: 'state',
      accessorFn: (row) => stateOf(row),
      header: 'State',
      meta: { className: 'w-[11%]' },
      cell: ({ row }) => <StateCell entry={row.original} />,
    },
    {
      // No width, deliberately: fixed layout hands the remainder to the one
      // column that declares none, and with optional columns out of the grid
      // there is a lot of remainder.
      accessorKey: 'name',
      header: label('name'),
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field="name" label={label('name')} />
      ),
    },
    ...OPTIONAL_COLUMNS.filter((field) => shown.has(field)).map((field) => optional[field]),
    actionsColumn<EvidenceEntry>((row) => row.name || 'record'),
  ]
}

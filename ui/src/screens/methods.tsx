import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { Case, MethodEntry } from '@/api/model'
import { fieldOf, formSpec, shortLabel, type Specs } from '@/api/specs'
import { suggestionsFor } from '@/api/suggestions'
import { Absent } from '@/components/ui/absent'
import { BulkActionBar, bulkFieldsFor } from '@/components/blocks/bulk-actions'
import { Collection } from '@/components/blocks/collection'
import { ConfirmDeleteDialog } from '@/components/blocks/confirm-delete-dialog'
import { SelectCell, TextCell } from '@/components/blocks/data-cell'
import {
  actionsColumn,
  selectionColumn,
  useEntityTable,
  type EntityColumn,
  type EntityRow,
} from '@/components/blocks/data-table'
import { StoredFacts } from '@/components/blocks/detail-grid'
import { EntityDialog } from '@/components/blocks/entity-dialog'
import { useFilters } from '@/components/blocks/filter-set'
import { AddAction, countLine } from '@/components/blocks/section-head'
import { FieldToneBadge } from '@/components/blocks/severity-badge'
import { CodeBlock } from '@/components/ui/code-block'

import { matchesMethod, rowsText, windowText } from './methods-rows'
import { localId, useRowEditor } from '@/components/blocks/row-editing'

/**
 * How each finding in this case was obtained: the query, where it ran, and
 * what came back.
 *
 * - **A row is a lab note about an act that happened elsewhere.** Nothing here
 *   runs, resolves or verifies: `console` and `workspace` name a console to
 *   open, and every count is what a person typed.
 * - **What it established leads, and the name follows it.** A method is read
 *   for the claim it supports; its name is the label a citation carries, and
 *   that is the order the report's appendix prints.
 * - **The window is one column.** Its two ends are one fact an analyst states
 *   as a pair, and half a window draws as half a window.
 * - **The query and the transcript belong to the expanded row**, where they
 *   keep their line breaks and their gutter. A five-line query in a table cell
 *   is one line of ellipsis.
 */

/**
 * Where this screen's writes go when something is serving it.
 *
 * **Each one resolves with what the server stored**, and the list is updated
 * from that rather than from a copy this screen merged itself. The version
 * check can refuse, and a screen that had already merged its own answer would
 * be showing a value the case does not hold.
 *
 * Three, because this collection takes writes three ways and a container
 * wiring two of them looks correct: `bulk` is the one no story presses by
 * accident, and the one whose absence is invisible until a selection is made.
 */
export interface MethodWrites {
  /** `entry` null creates. Resolves with the stored row. */
  save: (entry: MethodEntry | null, fields: Partial<MethodEntry>) => Promise<MethodEntry>
  /** One patch across a named selection. Resolves with the stored rows. */
  patch: (ids: readonly string[], fields: Partial<MethodEntry>) => Promise<readonly MethodEntry[]>
  remove: (ids: readonly string[]) => Promise<void>
}

export interface MethodsScreenProps {
  kase: Case | undefined
  specs: Specs | undefined
  /** What the search box opens with. */
  search?: string
  /**
   * The collection is still being read.
   *
   * The screen draws no rows and no empty state while this holds: an empty
   * state is an answer, and a read that has not returned does not have one.
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
   * Supplied, every write leaves and the list is updated from what comes back.
   */
  writes?: MethodWrites
}

/** Stable, so the gallery's table meta does not change identity every render. */
const EMPTY_PENDING: ReadonlySet<string> = new Set()

/** The column the search box names, and the heading it has to match. */
const NAME_COLUMN = 'Name'

/** What the table already draws, so the expanded row does not repeat it. */
const COLUMNED = [
  'established',
  'name',
  'kind',
  'console',
  'windowFrom',
  'windowTo',
  'rowsReturned',
]

/**
 * What the facts grid may not draw, whatever else it holds.
 *
 * Both are recorded verbatim and both reach `String(value)` as one line with
 * their newlines rendered as spaces. They are drawn under the grid instead,
 * where a line break is a line break.
 */
const RECORDED = ['query', 'resultExcerpt']

/**
 * The collection answering itself, which is what a story is.
 *
 * The same interface a container implements, so the screen has one write path
 * rather than a served branch and a gallery branch.
 */
function galleryWrites(): MethodWrites {
  return {
    save: (entry, fields) =>
      Promise.resolve(
        entry ? { ...entry, ...fields } : { ...BLANK_METHOD, ...fields, id: localId('method') },
      ),
    patch: (ids, fields) => Promise.resolve(ids.map((id) => ({ ...BLANK_METHOD, ...fields, id }))),
    remove: () => Promise.resolve(),
  }
}

export function MethodsScreen({
  kase,
  specs,
  search = '',
  busy = false,
  problem,
  onRetry,
  writes,
}: MethodsScreenProps) {
  /**
   * The collection, held so a write can update it from the row the server
   * stored, and **re-synced whenever a new case arrives** -- which is what
   * makes another analyst's write repaint this screen.
   *
   * The same shape as `actions`, `impact` and `timeline`. It was
   * `useAsyncList`, which loads once on mount and refreshes only through a
   * `reload` this screen kept to itself, so nothing outside could repaint it.
   */
  const [rows, setRows] = useState(kase?.methods ?? [])
  const [given, setGiven] = useState(kase)
  if (given !== kase) {
    setGiven(kase)
    setRows(kase?.methods ?? [])
  }

  /** One write path. Omitted, the gallery answers for itself. */
  const write = writes ?? galleryWrites()

  /** A write in flight, so the rows it touches read as busy. */
  const [writing, setWriting] = useState<ReadonlySet<string>>(EMPTY_PENDING)

  /**
   * Marks rows busy for the length of one write, and clears them however it
   * ends.
   *
   * **A refusal is an answer, not an error**, so this deliberately does not
   * catch: a rejected write leaves the list untouched, which is correct, and
   * naming the fields that collided belongs to whoever supplied `writes`.
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
  const editor = useRowEditor<MethodEntry>()

  const form = useMemo(
    () => (specs ? formSpec<MethodEntry>(specs, 'METHOD_FIELDS') : undefined),
    [specs],
  )
  /**
   * The case's own consoles, workspaces, people and tags.
   *
   * `autocomplete` and `tag_select` are served with no options, so without
   * this the dialog offers an empty list for the four fields whose vocabulary
   * is this case rather than the schema.
   */
  const suggestions = useMemo(() => (form ? suggestionsFor(form, rows) : {}), [form, rows])

  const kinds = useMemo(
    () => [...new Set(rows.map((row) => row.kind).filter(Boolean))].sort(),
    [rows],
  )
  const consoles = useMemo(
    () => [...new Set(rows.map((row) => row.console).filter(Boolean))].sort(),
    [rows],
  )

  const filters = useFilters([
    {
      key: 'kind',
      label: 'Kind',
      options: kinds.map((kind) => ({
        value: kind,
        count: rows.filter((row) => row.kind === kind).length,
      })),
    },
    {
      key: 'console',
      label: 'Console',
      options: consoles.map((console) => ({
        value: console,
        count: rows.filter((row) => row.console === console).length,
      })),
    },
  ])
  const chosenKinds = filters.chosen('kind')
  const chosenConsoles = filters.chosen('console')

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (!matchesMethod(row, query)) return false
        if (chosenKinds.length && !chosenKinds.includes(row.kind)) return false
        if (chosenConsoles.length && !chosenConsoles.includes(row.console)) return false
        return true
      }),
    [rows, query, chosenKinds, chosenConsoles],
  )

  const columns = useMemo(() => (specs ? methodColumns(specs) : []), [specs])
  const bulkFields = useMemo(() => (form ? bulkFieldsFor(form) : []), [form])

  const table = useEntityTable<MethodEntry>({
    data: visible,
    columns,
    enableExpanding: true,
    initialSorting: [{ id: 'established', desc: false }],
    meta: {
      pendingIds: writing,
      /*
       * Nothing in this tier reaches this: no aria cell edits in place, so the
       * only inline write a method could take has no door. The table's meta
       * requires the field, so it answers the list and goes no further.
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
      collection: 'methods',
    },
  })

  /**
   * The dialog's answer, written into this screen's copy of the collection.
   *
   * **Answered, not fired and forgotten.** The dialog closes itself when this
   * resolves and stays open with the reason when it does not, so closing here
   * would throw the draft away before the server had answered for it.
   */
  const save = (entry: MethodEntry | null, fields: Partial<MethodEntry>) =>
    inFlight(entry ? [entry.id] : [], async () => {
      const stored = await write.save(entry, fields)
      setRows((was) =>
        entry ? was.map((row) => (row.id === entry.id ? stored : row)) : [...was, stored],
      )
    })

  return (
    <Collection
      title="Methods"
      meta={countLine({ shown: visible.length, total: rows.length, noun: 'method' })}
      blurb="The app runs nothing here. Every value is what an analyst recorded."
      actions={<AddAction label="Add method" onPress={editor.add} />}
      search={{
        column: NAME_COLUMN,
        placeholder: "A method's name",
        value: query,
        onValue: setQuery,
      }}
      filters={filters}
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
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
      table={{
        table,
        scroll: 'page',
        className: '[&_table]:min-w-[56rem]',
        label: 'Methods',
        renderExpanded: (row) => <Detail row={row} />,
      }}
      empty={{
        title: 'No methods recorded',
        detail: 'How a finding was obtained: the query, where it ran, and what it returned.',
        icon: Search,
        action: <AddAction label="Add method" variant="outline" onPress={editor.add} />,
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
          count === 1 ? 'Delete this method?' : `Delete ${String(count)} methods?`
        }
        consequence="Every claim citing it keeps a dangling reference."
      />

      {form && (editor.creating || editor.editing) && (
        <EntityDialog
          key={editor.editing?.id ?? 'new'}
          open
          onOpenChange={editor.close}
          collection="methods"
          title={editor.editing ? 'Edit method' : 'Add method'}
          form={form}
          suggestions={suggestions}
          // No `references`: a method points at nothing. The reference runs the
          // other way, from the collections that cite one.
          {...(editor.editing ? { entry: editor.editing } : {})}
          onCreate={(fields) => save(editor.editing, fields)}
        />
      )}
    </Collection>
  )
}

/**
 * The expanded row: what the grid left out, then the recorded text.
 *
 * The facts grid draws the short values; the two verbatim fields are drawn
 * under it, where a line break survives and a long line scrolls sideways
 * rather than wrapping.
 */
function Detail({ row }: { row: EntityRow<MethodEntry> }) {
  const entry = row.original
  return (
    <div className="flex flex-col gap-3">
      <StoredFacts
        fields={entry}
        omit={[...COLUMNED, ...RECORDED]}
        table="methods"
        entryId={entry.id}
      />

      {entry.query ? (
        <CodeBlock
          code={entry.query}
          {...(entry.grammar ? { language: entry.grammar } : {})}
          label={entry.console || 'Query or command'}
          copy
          lineNumbers
          aria-label={`Query for ${entry.name || 'this method'}`}
        />
      ) : null}

      {entry.resultExcerpt ? (
        <CodeBlock
          code={entry.resultExcerpt}
          label="Result or transcript"
          copy
          aria-label={`Recorded result for ${entry.name || 'this method'}`}
        />
      ) : null}
    </div>
  )
}

/** What a method carries that the served form does not ask for. */
const BLANK_METHOD: Omit<MethodEntry, 'id'> = {
  version: 1,
  name: '',
  kind: '',
  established: '',
  console: '',
  workspace: '',
  runBy: '',
  runAt: null,
  grammar: '',
  query: '',
  windowFrom: null,
  windowTo: null,
  rowsReturned: null,
  resultColumns: '',
  resultExcerpt: '',
  tags: '',
}

/** One field's column heading, from the served form. */
function methodLabel(specs: Specs, name: string): string {
  const overrides: Record<string, string> = {
    established: 'What it established',
    name: NAME_COLUMN,
    // Served as "Rows returned (as recorded)": the parenthetical is the
    // honesty the form and the report owe, and a column of typed numbers has
    // its own heading saying it once.
    rowsReturned: 'Rows',
  }
  return (
    overrides[name] ??
    shortLabel(fieldOf(formSpec<MethodEntry>(specs, 'METHOD_FIELDS'), name)?.label ?? name)
  )
}

function methodColumns(specs: Specs): EntityColumn<MethodEntry>[] {
  const label = (name: string) => methodLabel(specs, name)
  const kindTones = specs.fieldTones.kind

  return [
    selectionColumn<MethodEntry>((row) => `Select ${row.name || 'this method'}`),
    {
      // The one column with no width: the claim is a sentence and takes what
      // the five sized ones leave.
      accessorKey: 'established',
      header: label('established'),
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field="established" label={label('established')} wrap />
      ),
    },
    {
      accessorKey: 'name',
      header: label('name'),
      meta: { className: 'w-[16%]' },
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field="name" label={label('name')} />
      ),
    },
    {
      accessorKey: 'kind',
      header: label('kind'),
      meta: { className: 'w-[12%]' },
      cell: ({ row, table }) => (
        <SelectCell
          row={row}
          table={table}
          field="kind"
          label={label('kind')}
          view={(value) =>
            value ? (
              <FieldToneBadge value={value} tone={kindTones?.[value.trim().toLowerCase()]} />
            ) : (
              <Absent />
            )
          }
        />
      ),
    },
    {
      accessorKey: 'console',
      header: label('console'),
      meta: { className: 'w-[14%]' },
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field="console" label={label('console')} />
      ),
    },
    {
      id: 'window',
      accessorFn: (row) => windowText(row),
      header: 'Window (UTC)',
      meta: { className: 'w-[15%]' },
      /*
       * Read-only, where its neighbours edit in place: the cell is two fields
       * joined, so there is nothing for one editor to write back to. Both ends
       * are set in the dialog.
       */
      cell: ({ row }) => {
        const text = windowText(row.original)
        return text ? (
          <span className="font-mono text-xs whitespace-nowrap">{text}</span>
        ) : (
          <Absent className="text-xs" />
        )
      },
    },
    {
      accessorKey: 'rowsReturned',
      header: label('rowsReturned'),
      meta: { className: 'w-[8%]' },
      cell: ({ row }) => {
        const text = rowsText(row.original)
        return text === null ? <Absent /> : <span className="font-mono">{text}</span>
      },
    },
    actionsColumn<MethodEntry>((row) => row.name || 'method'),
  ]
}

import { Plus, ShieldAlert } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import type { Case, ImpactEntry } from '@/api/model'
import { fieldOf, formSpec, shortLabel, type Specs } from '@/api/specs'
import { BulkActionBar, bulkFieldsFor } from '@/components/blocks/bulk-actions'
import { Collection } from '@/components/blocks/collection'
import { ConfirmDeleteDialog } from '@/components/blocks/confirm-delete-dialog'
import { ReferenceCell, TextCell } from '@/components/blocks/data-cell'
import {
  actionsColumn,
  selectionColumn,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { DetailGrid, Fact } from '@/components/blocks/detail-grid'
import { EntityDialog } from '@/components/blocks/entity-dialog'
import { useFilters } from '@/components/blocks/filter-set'
import { FieldToneBadge } from '@/components/blocks/severity-badge'
import { AddAction, countLine } from '@/components/blocks/section-head'
import { Button } from '@/components/ui/button'

import { entityNames, referenceOptions } from '@/components/blocks/entity-scope'
import { localId, useRowEditor } from '@/components/blocks/row-editing'
import {
  OPTIONAL_COLUMNS,
  matchesData,
  shownColumns,
  volumeText,
  type OptionalColumn,
} from './impact-rows'

/**
 * What the incident reached, and what happened to it.
 *
 * The row is the data rather than the host holding it: the regulations ask
 * what was taken, altered or destroyed, and the host is a column on that
 * answer. A count is approximate on purpose - a false precision is worse than
 * a range, which is the served form's own wording.
 *
 * The add door, the empty state's offer and the row's pencil all open
 * `EntityDialog` on `IMPACT_FIELDS`.
 */
/**
 * Where this screen's writes go when something is serving it.
 *
 * **Each one resolves with what the server stored**, and the register is
 * updated from that rather than from a copy this screen merged itself. The
 * version check can refuse, and a screen that had already merged its own
 * answer would be showing a value the case does not hold.
 *
 * Three, because the screen offers three ways to change the register and a
 * container wiring two of them looks correct: `patch` is the one no story
 * presses by accident, and the one whose absence is invisible until a
 * selection is made.
 */
export interface ImpactWrites {
  /** `entry` null creates. Resolves with the stored row. */
  save: (entry: ImpactEntry | null, fields: Partial<ImpactEntry>) => Promise<ImpactEntry>
  /** One patch across a named selection. Resolves with the stored rows. */
  patch: (ids: readonly string[], fields: Partial<ImpactEntry>) => Promise<readonly ImpactEntry[]>
  remove: (ids: readonly string[]) => Promise<void>
}

export interface ImpactScreenProps {
  kase: Case | undefined
  specs: Specs | undefined
  /** What the search box opens with. */
  search?: string
  /**
   * The collection is still being read.
   *
   * The screen draws no rows and no empty state while this holds: an empty
   * state is an answer, and a read that has not returned does not have one --
   * and the fixture default below is the demo case, which is worse than
   * either.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
  /**
   * Omitted in the gallery, where a save changes this screen's own copy of the
   * register and nothing else -- which is what makes a story reviewable
   * without a server.
   *
   * Supplied, every write leaves and the register is updated from what comes
   * back. Merging first and sending afterwards is the optimistic path, and
   * this project refuses it: a row shown as saved that the version check
   * refused is the same lie one layer up.
   */
  writes?: ImpactWrites
}

/** Stable, so the gallery's table meta does not change identity every render. */
const EMPTY_PENDING: ReadonlySet<string> = new Set()

/**
 * The register answering itself, which is what a story is.
 *
 * The same interface a container implements, so the screen has one write path
 * rather than a served branch and a gallery branch. Two branches per write was
 * three chances to wire one side and not the other, and the gallery side is
 * the one no served test exercises.
 */
function galleryWrites(rows: readonly ImpactEntry[]): ImpactWrites {
  // The rows it is answering about, so a patch resolves with the whole record
  // rather than the two fields the bulk form set. A server answers with the
  // stored row and this has to answer the same shape, or a bulk edit reads as
  // every other field being cleared.
  const found = (id: string) => rows.find((row) => row.id === id)
  return {
    save: (entry, fields) =>
      Promise.resolve(
        entry ? { ...entry, ...fields } : { ...BLANK_IMPACT, ...fields, id: localId('impact') },
      ),
    patch: (ids, fields) =>
      Promise.resolve(ids.map((id) => ({ ...BLANK_IMPACT, ...found(id), ...fields, id }))),
    remove: () => Promise.resolve(),
  }
}

export function ImpactScreen({
  kase,
  specs,
  search = '',
  busy = false,
  problem,
  onRetry,
  writes,
}: ImpactScreenProps) {
  const [query, setQuery] = useState(search)
  const [rows, setRows] = useState(kase?.impact ?? [])
  const [deleting, setDeleting] = useState<string[] | null>(null)
  const editor = useRowEditor<ImpactEntry>()

  /** One write path. Omitted, the gallery answers for itself. */
  const write = writes ?? galleryWrites(rows)

  /** A write in flight, so the rows it touches read as busy. */
  const [writing, setWriting] = useState<ReadonlySet<string>>(EMPTY_PENDING)

  /**
   * Marks rows busy for the length of one write, and clears them however it
   * ends.
   *
   * **A refusal is an answer, not an error**, so this deliberately does not
   * catch: a rejected write leaves the register untouched, which is correct,
   * and naming the fields that collided belongs to whoever supplied `writes`.
   */
  const inFlight = async (ids: readonly string[], run: () => Promise<void>) => {
    setWriting(new Set(ids))
    try {
      await run()
    } finally {
      setWriting(EMPTY_PENDING)
    }
  }

  const names = useMemo(
    () =>
      kase
        ? entityNames(kase)
        : { system: new Map<string, string>(), account: new Map<string, string>() },
    [kase],
  )
  const evidence = useMemo(
    () => new Map((kase?.evidence ?? []).map((row) => [row.id, row.name])),
    [kase],
  )
  const shown = useMemo(() => shownColumns(rows), [rows])

  const nameFor = useCallback(
    (id: string | null | undefined): string =>
      typeof id === 'string' ? (names.system.get(id) ?? names.account.get(id) ?? '') : '',
    [names],
  )

  const dispositionsHeld = useMemo(
    () => [...new Set(rows.map((row) => row.disposition).filter(Boolean))].sort(),
    [rows],
  )
  const categoriesHeld = useMemo(
    () => [...new Set(rows.map((row) => row.category).filter(Boolean))].sort(),
    [rows],
  )

  const filters = useFilters([
    {
      key: 'disposition',
      label: 'What happened',
      options: dispositionsHeld.map((value) => ({
        value,
        count: rows.filter((row) => row.disposition === value).length,
      })),
    },
    {
      // Whatever this case holds rather than a fixed vocabulary, so it goes
      // behind one trigger instead of widening the row by a chip each.
      key: 'category',
      label: 'Category',
      as: 'picker',
      groupLabel: 'Data category',
      options: categoriesHeld.map((value) => ({
        value,
        count: rows.filter((row) => row.category === value).length,
      })),
    },
  ])
  const dispositions = filters.chosen('disposition')
  const categories = filters.chosen('category')

  const [given, setGiven] = useState(kase)
  if (given !== kase) {
    setGiven(kase)
    setRows(kase?.impact ?? [])
    setQuery(search)
    filters.clear()
  }

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (!matchesData(row, query)) return false
        if (dispositions.length && !dispositions.includes(row.disposition)) return false
        if (categories.length && !categories.includes(row.category)) return false
        return true
      }),
    [rows, query, dispositions, categories],
  )

  const columns = useMemo(
    () => (specs ? impactColumns(specs, shown, names.system) : []),
    [specs, shown, names],
  )
  const bulkFields = useMemo(
    () => (specs ? bulkFieldsFor(formSpec<ImpactEntry>(specs, 'IMPACT_FIELDS')) : []),
    [specs],
  )
  const table = useEntityTable<ImpactEntry>({
    data: visible,
    columns,
    meta: {
      pendingIds: writing,
      commit: (id, fields) => {
        setRows((current) => current.map((row) => (row.id === id ? { ...row, ...fields } : row)))
      },
      edit: (id) => {
        const found = rows.find((row) => row.id === id)
        if (found) editor.edit(found)
      },
      collection: 'impact',
    },
  })

  /**
   * The dialog's answer, written into this screen's copy of the collection.
   *
   * **Answered, not fired and forgotten.** The dialog closes itself when this
   * resolves and stays open with the reason when it does not, so closing here
   * would throw the draft away before the server had answered for it.
   */
  const save = (entry: ImpactEntry | null, fields: Partial<ImpactEntry>) =>
    inFlight(entry ? [entry.id] : [], async () => {
      const stored = await write.save(entry, fields)
      setRows((current) =>
        entry ? current.map((row) => (row.id === entry.id ? stored : row)) : [...current, stored],
      )
    })

  return (
    <Collection
      title="Impact"
      meta={countLine({ total: rows.length, noun: 'record' })}
      actions={<AddAction label="Add record" onPress={editor.add} />}
      search={{
        column: 'Data',
        placeholder: 'What data was reached',
        value: query,
        onValue: setQuery,
      }}
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
      filters={filters}
      toolbarEnd={
        <BulkActionBar
          table={table}
          fields={bulkFields}
          onApply={(ids, fields) => {
            void inFlight(ids, async () => {
              const stored = new Map(
                (await write.patch(ids, fields)).map((row) => [row.id, row] as const),
              )
              setRows((current) => current.map((row) => stored.get(row.id) ?? row))
            })
          }}
          onRequestDelete={setDeleting}
        />
      }
      table={{
        table,
        scroll: 'page',
        className: '[&_table]:min-w-[56rem]',
        label: 'Impact records',
        renderExpanded: (row) => {
          const entry = row.original
          return (
            <DetailGrid table="impact" entryId={entry.id}>
              <Fact label="Account">{nameFor(entry.accountId) || '\u2014'}</Fact>
              <Fact label="Volume">{volumeText(entry.volumeBytes) || '\u2014'}</Fact>
              <Fact label="Evidence">
                {entry.evidenceIds
                  .map((id) => evidence.get(id) ?? '')
                  .filter(Boolean)
                  .join(', ') || '\u2014'}
              </Fact>
              <Fact label="Notes">{entry.notes || '\u2014'}</Fact>
              <Fact label="Tags">{entry.tags || '\u2014'}</Fact>
            </DetailGrid>
          )
        },
      }}
      empty={{
        icon: ShieldAlert,
        title: 'No data impact recorded yet',
        detail:
          'What the incident reached, and whether it was taken, encrypted, altered or destroyed.',
        action: (
          <Button variant="outline" onPress={editor.add}>
            <Plus aria-hidden />
            Add record
          </Button>
        ),
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
            const gone = new Set(doomed)
            setRows((current) => current.filter((row) => !gone.has(row.id)))
          })
        }}
        title={(count) =>
          count === 1 ? 'Delete this record?' : `Delete ${String(count)} records?`
        }
        consequence="The record goes; nothing it cites is undone."
      />

      {kase && specs && (editor.creating || editor.editing) && (
        <EntityDialog
          key={editor.editing?.id ?? 'new'}
          open
          onOpenChange={editor.close}
          collection="impact"
          title={editor.editing ? 'Edit record' : 'Add record'}
          form={formSpec<ImpactEntry>(specs, 'IMPACT_FIELDS')}
          // Every collection `IMPACT_FIELDS` can reference: `evidenceIds`
          // and `methodIds` point at `evidence` and `methods`, and a
          // reference field with no options draws every chip as "(missing
          // reference)".
          references={referenceOptions(kase)}
          {...(editor.editing ? { entry: editor.editing } : {})}
          onCreate={(fields) => save(editor.editing, fields)}
        />
      )}
    </Collection>
  )
}

/**
 * The fields an impact row carries that the served form does not ask for.
 *
 * A row added here is otherwise missing the arrays the expanded row reads, and
 * `.map` on `undefined` is a blank screen rather than a blank cell.
 */
const BLANK_IMPACT: Omit<ImpactEntry, 'id'> = {
  version: 1,
  label: '',
  category: '',
  disposition: 'unknown',
  systemId: null,
  accountId: null,
  subjectCount: 0,
  recordCount: 0,
  volumeBytes: 0,
  notes: '',
  tags: '',
  evidenceIds: [],
  methodIds: [],
}

function impactColumns(
  specs: Specs,
  shown: ReadonlySet<OptionalColumn>,
  systems: ReadonlyMap<string, string>,
): EntityColumn<ImpactEntry>[] {
  const form = formSpec<ImpactEntry>(specs, 'IMPACT_FIELDS')
  const overrides: Record<string, string> = {
    label: 'Data',
    disposition: 'What happened',
    subjectCount: 'Subjects',
    recordCount: 'Records',
    systemId: 'Held on',
  }
  const label = (name: string) => overrides[name] ?? shortLabel(fieldOf(form, name)?.label ?? name)
  const tones = specs.fieldTones.disposition

  const count = (field: 'subjectCount' | 'recordCount'): EntityColumn<ImpactEntry> => ({
    id: field,
    accessorFn: (row) => row[field] ?? -1,
    header: label(field),
    meta: { className: 'w-[10%] text-right' },
    cell: ({ row }) => (
      <span className="block truncate tabular-nums">
        {typeof row.original[field] === 'number'
          ? row.original[field].toLocaleString('en-GB')
          : '\u2014'}
      </span>
    ),
  })

  const optional: Record<OptionalColumn, EntityColumn<ImpactEntry>> = {
    category: {
      accessorKey: 'category',
      header: label('category'),
      meta: { className: 'w-[17%]' },
      cell: ({ row, table }) => (
        <TextCell
          row={row}
          table={table}
          field="category"
          label={label('category')}
          // Clips itself, as a `view` rendering bare text has to: `TextCell`
          // withholds `truncate` from a view deliberately.
          view={(value) => <span className="block truncate text-ink-muted">{value || '\u2014'}</span>}
        />
      ),
    },
    subjectCount: count('subjectCount'),
    recordCount: count('recordCount'),
    systemId: {
      accessorKey: 'systemId',
      header: label('systemId'),
      meta: { className: 'w-[12%]' },
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
  }

  return [
    selectionColumn<ImpactEntry>((row) => `Select ${row.label}`),
    {
      accessorKey: 'disposition',
      header: label('disposition'),
      meta: { className: 'w-[13%]' },
      cell: ({ row }) => (
        <FieldToneBadge
          value={row.original.disposition}
          tone={tones?.[row.original.disposition.trim().toLowerCase()]}
          className="whitespace-nowrap"
        />
      ),
    },
    {
      // No width, deliberately: fixed layout hands the remainder to the one
      // column that declares none, and the data's own name is what it should go to.
      accessorKey: 'label',
      header: label('label'),
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field="label" label={label('label')} />
      ),
    },
    ...OPTIONAL_COLUMNS.filter((field) => shown.has(field)).map((field) => optional[field]),
    actionsColumn<ImpactEntry>((row) => row.label || 'record'),
  ]
}

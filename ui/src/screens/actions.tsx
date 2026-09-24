import { useMemo, useState, type ReactNode } from 'react'

import type { ActionEntry, Case } from '@/api/model'
import { editedAt, type Drawn, type Read } from '@/api/rowWrite'
import type { BulkPatchRow } from '@/api/useBulkPatch'
import { formSpec, type Specs } from '@/api/specs'
import { BulkActionBar, bulkFieldsFor, selected } from '@/components/blocks/bulk-actions'
import { Collection } from '@/components/blocks/collection'
import { ConfirmDeleteDialog } from '@/components/blocks/confirm-delete-dialog'
import { SelectCell, TextCell } from '@/components/blocks/data-cell'
import { StoredFacts } from '@/components/blocks/detail-grid'
import {
  actionsColumn,
  selectionColumn,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { EntityDialog } from '@/components/blocks/entity-dialog'
import { AddAction, countLine } from '@/components/blocks/section-head'
import { useFilters } from '@/components/blocks/filter-set'
import { FieldToneBadge } from '@/components/blocks/severity-badge'
import type { FieldToneSpec } from '@/api/specs'

import { matchesTask } from './action-rows'
import { localId, useRowEditor } from '@/components/blocks/row-editing'
import { labelled } from '@/lib/field-label'
import { useInFlight } from '@/lib/useInFlight'
import { useCaseRows, useResetOnCase } from '@/lib/case-rows'

/**
 * The SOC's task list for this case: what is still to be done, by whom, and
 * when it is due.
 *
 * The task is the one prose column in this app's tables, so it wraps rather
 * than truncating - the half a truncation hides is the half that says what to
 * do - and it is the column that declares no width, taking what the sized
 * ones leave.
 *
 * The bulk bar's fields are the served form's own closed vocabularies, so
 * setting a status across a selection offers exactly what the dialog offers.
 *
 * The add door and the row's pencil open `EntityDialog` on `ACTION_FIELDS`.
 */
/**
 * Where this screen's writes go when something is serving it.
 *
 * **Each one resolves with what the server stored**, and the list is updated
 * from that rather than from a copy this screen merged itself. The version
 * check can refuse, and a screen that had already merged its own answer would
 * be showing a value the case does not hold.
 *
 * Three, because the task list takes writes three ways and a container wiring
 * two of them looks correct: `patch` is the one no story presses by accident,
 * and the one whose absence is invisible until a selection is made.
 */
export interface ActionWrites {
  /** `entry` null creates. Resolves with the stored row. */
  save: (entry: Drawn<ActionEntry> | null, fields: Partial<ActionEntry>) => Promise<ActionEntry>
  /** One patch across a named selection. Resolves with the stored rows. */
  patch: (rows: readonly BulkPatchRow[], fields: Partial<ActionEntry>) => Promise<readonly ActionEntry[]>
  remove: (rows: readonly BulkPatchRow[]) => Promise<void>
}

export interface ActionsScreenProps {
  kase: Case | undefined
  specs: Specs | undefined
  /**
   * The collection is still being read.
   *
   * The screen draws no rows and no empty state while this holds: an empty
   * state is an answer, and a read that has not returned does not have one --
   * and the fixture default below is the demo case, which is worse than
   * either.
   */
  busy?: boolean
  /** What the search box opens with. Stories draw a screen already filtered. */
  search?: string
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
  /**
   * Omitted in the gallery, where a save changes this screen's own copy of the
   * task list and nothing else -- which is what makes a story reviewable
   * without a server.
   *
   * Supplied, every write leaves and the list is updated from what comes back.
   * Merging first and sending afterwards is the optimistic path, and this
   * project refuses it: a task shown as saved that the version check refused
   * is the same lie one layer up.
   */
  writes?: ActionWrites
}


/**
 * The task list answering itself, which is what a story is.
 *
 * The same interface a container implements, so the screen has one write path
 * rather than a served branch and a gallery branch.
 */
function galleryWrites(rows: readonly ActionEntry[]): ActionWrites {
  // The rows it is answering about, so a patch resolves with the whole task
  // rather than the one field the bulk form set. A server answers with the
  // stored row and this has to answer the same shape.
  const found = (id: string) => rows.find((row) => row.id === id)
  return {
    save: (entry, fields) =>
      Promise.resolve(
        entry ? { ...entry, ...fields, version: entry.version + 1 } : { ...BLANK_ACTION, ...fields, id: localId('action') },
      ),
    patch: (chosen, fields) =>
      Promise.resolve(chosen.map(({ id }) => ({ ...BLANK_ACTION, ...found(id), ...fields, id }))),
    remove: () => Promise.resolve(),
  }
}

export function ActionsScreen({
  kase,
  specs,
  search = '',
  busy = false,
  problem,
  onRetry,
  writes,
}: ActionsScreenProps) {
  const [rows, setRows] = useCaseRows(kase, (one) => one.actions)
  const [query, setQuery] = useState(search)

  const [deleting, setDeleting] = useState<BulkPatchRow[] | null>(null)
  const editor = useRowEditor<ActionEntry>()

  /** One write path. Omitted, the gallery answers for itself. */
  const write = writes ?? galleryWrites(rows)

  const [writing, inFlight] = useInFlight()

  const states = useMemo(
    () => [...new Set(rows.map((row) => row.status).filter(Boolean))].sort(),
    [rows],
  )

  const filters = useFilters([
    {
      key: 'status',
      label: 'Status',
      options: states.map((status) => ({
        value: status,
        count: rows.filter((row) => row.status === status).length,
      })),
    },
  ])
  const statuses = filters.chosen('status')

  // **The analyst's place in this case, put back when they leave it.** Below
  // the filters, because a screen's filter options are counted off its rows --
  // so this cannot be called before they exist.
  useResetOnCase(kase, () => {
    setQuery('')
    filters.clear()
  })

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (!matchesTask(row, query)) return false
        if (statuses.length && !statuses.includes(row.status)) return false
        return true
      }),
    [rows, query, statuses],
  )

  const columns = useMemo(() => (specs ? actionColumns(specs) : []), [specs])
  const bulkFields = useMemo(
    () => (specs ? bulkFieldsFor(formSpec<ActionEntry>(specs, 'ACTION_FIELDS')) : []),
    [specs],
  )

  const table = useEntityTable<ActionEntry>({
    data: visible,
    columns,
    // **The same row must open here as on every other table.** Nearly every
    // served field is a column, so what is left is `tags` and the attribution
    // line -- thin, and still the only place either is readable.
    enableExpanding: true,
    meta: {
      pendingIds: writing,
      commit: (id, fields) => {
        setRows((current) => current.map((row) => (row.id === id ? { ...row, ...fields } : row)))
      },
      remove: (id) => {
        const found = rows.find((row) => row.id === id)
        if (found) setDeleting([selected(found)])
      },
      edit: (id) => {
        const found = rows.find((row) => row.id === id)
        if (found) editor.edit(found)
      },
      collection: 'actions',
    },
  })

  /**
   * The dialog's answer, written into this screen's copy of the task list.
   *
   * **Answered, not fired and forgotten.** The dialog closes itself when this
   * resolves and stays open with the reason when it does not, so closing here
   * would throw the draft away before the server had answered for it.
   */
  const save = (entry: Drawn<ActionEntry> | null, fields: Partial<ActionEntry>) =>
    inFlight(entry ? [entry.id] : [], async () => {
      const stored = await write.save(entry, fields)
      setRows((current) =>
        entry ? current.map((row) => (row.id === entry.id ? stored : row)) : [...current, stored],
      )
    })

  return (
    <Collection
      title="Actions"
      meta={countLine({ shown: visible.length, total: rows.length, noun: 'task' })}
      actions={<AddAction label="Add task" onPress={editor.add} />}
      search={{
        column: 'Task',
        placeholder: 'What is to be done',
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
          onApply={(chosen, fields) => {
            void inFlight(chosen.map((row) => row.id), async () => {
              const stored = new Map(
                (await write.patch(chosen, fields)).map((row) => [row.id, row] as const),
              )
              setRows((current) => current.map((row) => stored.get(row.id) ?? row))
            })
          }}
          onRequestDelete={setDeleting}
        />
      }
      table={{
        table,
        scroll: 'box',
        className: '[&_table]:min-w-[52rem]',
        label: 'Actions',
        renderExpanded: (row) => (
          <StoredFacts
            fields={row.original}
            omit={ACTION_COLUMNS}
            table="actions"
            entryId={row.original.id}
          />
        ),
      }}
      empty={{
        title: 'No tasks yet',
        detail: 'Containment, eradication and recovery work is tracked here.',
      }}
    >
      <ConfirmDeleteDialog
        rows={deleting}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null)
        }}
        named={(id) => rows.find((row) => row.id === id)?.task}
        // **Returned**, so a refusal keeps the dialog open and names the rows that moved.
        onConfirm={() => {
          const doomed = deleting ?? []
          const gone = new Set(doomed.map((row) => row.id))
          return inFlight([...gone], async () => {
            await write.remove(doomed)
            table.resetRowSelection()
            setRows((was) => was.filter((row) => !gone.has(row.id)))
          })
        }}
        title={(count) => (count === 1 ? 'Delete this task?' : `Delete ${String(count)} tasks?`)}
        consequence="The task goes; nothing it describes is undone."
      />

      {specs && (editor.creating || editor.editing) && (
        <EntityDialog
          key={editor.editing?.id ?? 'new'}
          open
          onOpenChange={editor.close}
          collection="actions"
          title={editor.editing ? 'Edit task' : 'Add task'}
          form={formSpec<ActionEntry>(specs, 'ACTION_FIELDS')}
          {...(editor.editing
            ? { entry: editor.editing, served: rows.find((row) => row.id === editor.editing?.id) }
            : {})}
          onCreate={(fields, read?: Read) =>
            save(editedAt(editor.editing, read), fields)
          }
        />
      )}
    </Collection>
  )
}

/** What the table already shows, so the expanded row does not repeat it. */
const ACTION_COLUMNS = ['task', 'taskType', 'status', 'assignee', 'dateDue'] as const

/** What a task carries that the served form does not ask for. */
const BLANK_ACTION: Omit<ActionEntry, 'id'> = {
  version: 1,
  source: 'manual',
  task: '',
  taskType: '',
  status: 'open',
  assignee: '',
  dateDue: '',
  tags: '',
}

/** A tone chip where the server maps one, plain text where it does not. */
function paintTone(
  value: string,
  tones: Readonly<Record<string, FieldToneSpec>> | undefined,
): ReactNode {
  if (!value) return <span className="text-xs text-ink-muted">&#x2014;</span>
  return tones ? (
    <FieldToneBadge value={value} tone={tones[value.trim().toLowerCase()]} />
  ) : (
    // The only branch a column with no tone map ever takes, and a `view`
    // rendering bare text clips itself: `TextCell` withholds `truncate`.
    <span className="block truncate text-xs">{value}</span>
  )
}

function actionColumns(specs: Specs): EntityColumn<ActionEntry>[] {
  const form = formSpec<ActionEntry>(specs, 'ACTION_FIELDS')
  const label = labelled(form, { task: 'Task' })
  const statusTones = specs.fieldTones.status

  const text = (field: keyof ActionEntry): EntityColumn<ActionEntry> =>
    ({
      accessorKey: field,
      header: label(field),
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field={field} label={label(field)} />
      ),
    }) as EntityColumn<ActionEntry>

  const select = (
    field: 'taskType' | 'status',
    tones?: Readonly<Record<string, FieldToneSpec>>,
  ): EntityColumn<ActionEntry> => ({
    accessorKey: field,
    header: label(field),
    cell: ({ row, table }) => (
      <SelectCell
        row={row}
        table={table}
        field={field}
        label={label(field)}
        view={(value) => paintTone(value, tones)}
      />
    ),
  })

  return [
    selectionColumn<ActionEntry>((row) => `Select ${row.task}`),
    {
      accessorKey: 'task',
      header: label('task'),
      cell: ({ row, table }) => (
        <TextCell row={row} table={table} field="task" label={label('task')} wrap />
      ),
    },
    select('taskType'),
    select('status', statusTones),
    text('assignee'),
    text('dateDue'),
    actionsColumn<ActionEntry>((row) => row.task || 'action'),
  ]
}

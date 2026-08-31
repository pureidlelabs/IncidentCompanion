import type { ReactNode } from 'react'

import { EntityLink } from '@/components/blocks/entity-link'
import { metaOf, type EntityRow, type EntityTable } from '@/components/blocks/entity-table'
import { Absent } from '@/components/ui/absent'
import { cn } from '@/lib/cn'

/**
 * A table cell's view. Nothing here writes.
 *
 * The one gesture that changes a row is the pencil in its actions, which opens
 * the full dialog; no cell holds an editor.
 */

export interface DataCellProps<TData extends { id: string }> {
  row: EntityRow<TData>
  table: EntityTable<TData>
  field: keyof TData & string
  /** Named for the accessible text and for what a test looks the cell up by. */
  label: string
  /** How the value is painted - a tone chip, a link, a date. Plain text if absent. */
  view?: ((value: string) => ReactNode) | undefined
  /** Wrap rather than truncate, for the one prose column a table has. */
  wrap?: boolean | undefined
  /** Sits in a line of text rather than filling a cell. */
  inline?: boolean | undefined
  placeholder?: string | undefined
}

function valueOf<TData extends { id: string }>(row: EntityRow<TData>, field: keyof TData): string {
  const raw = row.original[field]
  return typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
}

/** Rows with a write in flight read dimmed. */
function pendingIn<TData extends { id: string }>(row: EntityRow<TData>, table: EntityTable<TData>) {
  return metaOf(table).pendingIds.has(row.id)
}

/**
 * A value as text.
 *
 * - Truncates by default; `wrap` keeps the whole of a prose column.
 * - An empty value renders `placeholder`, or an em dash.
 * - The full value is the cell's `title`, except when `inline`.
 */
export function TextCell<TData extends { id: string }>({
  row,
  table,
  field,
  view,
  placeholder,
  wrap,
  inline,
}: DataCellProps<TData>) {
  const value = valueOf(row, field)
  const pending = pendingIn(row, table)
  return (
    <span
      data-slot="data-cell"
      className={cn(
        'block',
        // **Truncation is for text, and `view` is not text.** A view wanting
        // to clip does it inside itself, where it knows what it is clipping.
        view ? 'min-w-0' : wrap ? 'whitespace-pre-wrap break-words' : 'truncate',
        inline && 'inline',
        pending && 'opacity-60',
      )}
      {...(value && !inline ? { title: value } : {})}
    >
      {view
        ? view(value)
        : value || <Absent {...(placeholder === undefined ? {} : { label: placeholder })} />}
    </span>
  )
}

/** A boolean, as a word rather than a control - a checkbox reads as clickable. */
export function BooleanCell<TData extends { id: string }>({
  row,
  table,
  field,
  label,
}: DataCellProps<TData>) {
  const pending = pendingIn(row, table)
  const yes = Boolean(row.original[field])
  return (
    <span
      data-slot="data-cell-boolean"
      aria-label={`${label}: ${yes ? 'yes' : 'no'}`}
      className={cn('text-ink-muted', pending && 'opacity-60')}
    >
      {yes ? 'yes' : 'no'}
    </span>
  )
}

/** Same as `TextCell`; kept as its own name so a column reads as what it holds. */
export function SelectCell<TData extends { id: string }>(props: DataCellProps<TData>) {
  return <TextCell {...props} />
}

export interface ReferenceCellProps<TData extends { id: string }>
  extends DataCellProps<TData> {
  /** The `ref.target` this field points at, for the card and the link. */
  target: string
  /** id -> display name, built once per table rather than per row. */
  options: ReadonlyMap<string, string>
}

/**
 * A reference, resolved to a name and carrying its hover card.
 *
 * - The name is a link; the whole cell is not a control.
 * - The card is `EntityLink`'s own, so this cell wraps it in no second one.
 * - An id that resolves to no name renders as `(missing reference)`.
 * - An empty value renders an em dash and no link.
 */
export function ReferenceCell<TData extends { id: string }>({
  row,
  table,
  field,
  target,
  options,
}: ReferenceCellProps<TData>) {
  const value = valueOf(row, field)
  const pending = pendingIn(row, table)
  if (!value) return <Absent />
  // The resolved name, not the id: the id is what the PATCH sends and what
  // nobody recognises on hover.
  const entity = { id: value, target, name: options.get(value) ?? '' }
  return (
    <span
      data-slot="data-cell-reference"
      className={cn('block truncate', pending && 'opacity-60')}
      title={options.get(value) ?? value}
    >
      <EntityLink entity={entity} />
    </span>
  )
}

import { useState } from 'react'

import { fieldsOf, type FieldKind, type FormSpec } from '@/api/specs'
import type { EntityTable } from '@/components/blocks/entity-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { ListBoxItem } from '@/components/ui/list-box'
import { Select } from '@/components/ui/select'

/** Keys of `TData` whose value is a string. What a select may write. */
type StringKeys<TData> = {
  [K in keyof TData]: TData[K] extends string ? K : never
}[keyof TData] &
  string

/** Keys of `TData` whose value is a boolean. What a Yes/No may write. */
type BooleanKeys<TData> = {
  [K in keyof TData]: TData[K] extends boolean ? K : never
}[keyof TData] &
  string

/**
 * One field a bulk edit may set.
 *
 * `apply` maps a chosen word onto the fields to write, so the dialog holds no
 * knowledge of what a field is made of.
 */
export interface BulkField<TData> {
  /** Unique within one table's list; also the dialog's control key. */
  field: keyof TData & string
  label: string
  /** What the dropdown offers, beside the sentinel. */
  options: readonly string[]
  apply: (choice: string) => Partial<TData>
}

/** The option meaning "do not touch this field", and what every field opens on. */
export const LEAVE_UNCHANGED = '(leave unchanged)'

/** What a checkbox field offers, and what each writes. */
export const BULK_BOOL_LABELS: Record<string, boolean> = { Yes: true, No: false }

/**
 * A select-backed bulk field.
 *
 * The one cast here rather than at each call site: a computed key over a
 * generic parameter widens to `{ [x: string]: string }`, which TypeScript
 * cannot narrow back to `Partial<TData>`.
 */
export function bulkSelect<TData>(
  field: StringKeys<TData>,
  label: string,
  options: readonly string[],
): BulkField<TData> {
  return {
    field,
    label,
    options,
    apply: (choice) => ({ [field]: choice }) as Partial<TData>,
  }
}

/** A checkbox-backed bulk field: Yes/No in, a real boolean out. */
export function bulkBoolean<TData>(field: BooleanKeys<TData>, label: string): BulkField<TData> {
  return {
    field,
    label,
    options: Object.keys(BULK_BOOL_LABELS),
    apply: (choice) => ({ [field]: BULK_BOOL_LABELS[choice] ?? false }) as Partial<TData>,
  }
}

/**
 * Which control a bulk edit offers for each served field kind.
 *
 * A total map over `FieldKind`, so an eleventh kind fails the build here
 * instead of landing in the `null` bucket. `select` and `checkbox` are the
 * only bulk-settable kinds: free text and a number destroy every selected row
 * at once, and a colour or a reference is not a shared value at all.
 */
type BulkMode = 'select' | 'boolean' | null

const BULK_MODE: Record<FieldKind, BulkMode> = {
  select: 'select',
  checkbox: 'boolean',
  text: null,
  number: null,
  textarea: null,
  autocomplete: null,
  tag_select: null,
  event_datetime: null,
  color: null,
  device_select: null,
  multi_device_select: null,
}

/**
 * The bulk fields a form offers, in the order the form declares them.
 *
 * A `select` with no options is dropped rather than rendered: an empty
 * dropdown beside four working ones reads as a loading failure. The two casts
 * are the same one `bulkSelect` carries, decided by the kind at runtime.
 */
export function bulkFieldsFor<TData>(form: FormSpec<TData>): BulkField<TData>[] {
  const fields: BulkField<TData>[] = []
  for (const field of fieldsOf(form)) {
    const mode = BULK_MODE[field.kind]
    if (mode === 'select') {
      if (!field.options || field.options.length === 0) continue
      fields.push(bulkSelect(field.name as StringKeys<TData>, field.label, field.options))
    } else if (mode === 'boolean') {
      fields.push(bulkBoolean(field.name as BooleanKeys<TData>, field.label))
    }
  }
  return fields
}

/**
 * The fields to write, given what each control is on.
 *
 * A field left on the sentinel is absent from the result, never set to a falsy
 * default. An empty object means the caller sends no PATCH at all.
 */
export function bulkPatch<TData>(
  fields: readonly BulkField<TData>[],
  choices: Readonly<Record<string, string>>,
): Partial<TData> {
  let patch: Partial<TData> = {}
  for (const field of fields) {
    const choice = choices[field.field] ?? LEAVE_UNCHANGED
    if (choice === LEAVE_UNCHANGED) continue
    patch = { ...patch, ...field.apply(choice) }
  }
  return patch
}

export interface BulkEditDialogProps<TData> {
  /** `null` is closed; an array is open and names what is about to change. */
  ids: string[] | null
  fields: readonly BulkField<TData>[]
  onOpenChange: (open: boolean) => void
  onApply: (ids: string[], patch: Partial<TData>) => void
}

/**
 * Set one closed-vocabulary field across every selected row.
 *
 * - Every control opens on `(leave unchanged)`, a real stored choice rather
 *   than a blank row, so applying the dialog untouched writes nothing.
 * - Apply refuses while the patch is empty.
 * - Closing clears the choices, so reopening on another selection arms nothing.
 */
export function BulkEditDialog<TData>({
  ids,
  fields,
  onOpenChange,
  onApply,
}: BulkEditDialogProps<TData>) {
  const [choices, setChoices] = useState<Record<string, string>>({})
  const about = ids ?? []
  const patch = bulkPatch(fields, choices)
  const nothingToApply = Object.keys(patch).length === 0

  const close = () => {
    setChoices({})
    onOpenChange(false)
  }

  return (
    <Dialog
      isOpen={ids !== null}
      size="form"
      onOpenChange={(open) => {
        if (!open) setChoices({})
        onOpenChange(open)
      }}
    >
      <DialogHeader
        title={`Edit ${String(about.length)} selected`}
        description="Only the fields you change are applied. The rest are left alone."
        onClose={close}
      />
      <DialogBody>
        <div className="flex flex-col gap-3">
          {fields.map((field) => (
            <Select
              key={field.field}
              label={field.label}
              selectedKey={choices[field.field] ?? LEAVE_UNCHANGED}
              onSelectionChange={(key) => {
                setChoices((current) => ({ ...current, [field.field]: String(key) }))
              }}
            >
              {[LEAVE_UNCHANGED, ...field.options].map((option) => (
                <ListBoxItem key={option} id={option}>
                  {option}
                </ListBoxItem>
              ))}
            </Select>
          ))}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onPress={close}>
          Cancel
        </Button>
        <Button
          variant="default"
          isDisabled={nothingToApply}
          onPress={() => {
            onApply(about, patch)
            setChoices({})
            onOpenChange(false)
          }}
        >
          Apply
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

export interface BulkActionBarProps<TData extends { id: string }> {
  table: EntityTable<TData>
  /** Empty offers no bulk edit at all, and no Edit button. */
  fields: readonly BulkField<TData>[]
  /** N per-row PATCHes through the ordinary hooks. Never a whole-case write. */
  onApply: (ids: string[], patch: Partial<TData>) => void
  /** Hands the ids to the screen's own delete confirmation. */
  onRequestDelete: (ids: string[]) => void
}

/**
 * The count and the two bulk controls, drawn only while rows are selected.
 *
 * - Renders nothing with an empty selection, so a header does not reflow the
 *   moment a tick lands.
 * - The ids come from the table's own selection, keyed by entry id, so a
 *   refetch that reorders rows leaves the same entries selected.
 * - Delete is requested, not performed: the screen owns the confirmation.
 */
export function BulkActionBar<TData extends { id: string }>({
  table,
  fields,
  onApply,
  onRequestDelete,
}: BulkActionBarProps<TData>) {
  const [editing, setEditing] = useState<string[] | null>(null)
  const ids = table.getSelectedRowModel().rows.map((row) => row.id)

  if (ids.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-muted">{ids.length} selected</span>
      {fields.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            setEditing(ids)
          }}
        >
          Edit {ids.length}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onPress={() => {
          onRequestDelete(ids)
        }}
      >
        Delete {ids.length}
      </Button>
      <BulkEditDialog
        ids={editing}
        fields={fields}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onApply={onApply}
      />
    </div>
  )
}

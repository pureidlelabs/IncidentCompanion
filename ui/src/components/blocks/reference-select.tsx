import { useMemo, useState } from 'react'

import { EntityLink, MISSING_REFERENCE } from '@/components/blocks/entity-link'
import { ComboBox } from '@/components/ui/combobox'
import { ListBoxItem } from '@/components/ui/list-box'
import { Tag, TagGroup } from '@/components/ui/tag-group'
import { cn } from '@/lib/cn'

/**
 * The create row's key. A sentinel rather than a flag, so it travels through
 * `onSelectionChange` as an ordinary row.
 */
const CREATE_VALUE = '\u0000create'

interface Row {
  value: string
  label: string
  create?: boolean
}

export interface ReferenceMultiSelectProps {
  /** The control's accessible name, for example the field's label. */
  label: string
  /** Selected ids, in stored order. */
  value: readonly string[]
  /** id -> display label for the target collection. See `api/refOptions.ts`. */
  options: ReadonlyMap<string, string>
  /** `FieldRef.target`, so a chip carries what kind of thing it links to. */
  target: string
  onChange: (ids: string[]) => void
  disabled?: boolean | undefined
  /** From `Field`'s render prop, so the label and any problem stay wired up. */
  id?: string | undefined
  'aria-describedby'?: string | undefined
  className?: string | undefined
  /** Opens a create dialog for `target` over whatever is already open. */
  onCreateNew?: (() => void) | undefined
  /** The create row's own label, since only the caller knows the noun. */
  createLabel?: string | undefined
}

/**
 * A `multi_device_select` field, edited as removable tags over the target
 * collection's own rows.
 *
 * - A `TagGroup` of what is chosen, above a `ComboBox` that appends one more.
 *   The tags carry roving focus and come off with Backspace or their own
 *   button.
 * - Nothing sorts, and a pick goes last: the stored order is what the graph
 *   draws in sequence.
 * - A chosen row leaves the picker's list until it is removed again.
 * - A selected id with no row behind it keeps its tag, labelled
 *   `(missing reference)` and removable.
 * - The create row survives every query and never enters the value; picking it
 *   calls `onCreateNew` and leaves the field alone.
 * - The picker stays open after a pick, so several references go in one run.
 *   While it is open the page behind it is `aria-hidden`, tags included.
 */
export function ReferenceMultiSelect({
  label,
  value,
  options,
  target,
  onChange,
  disabled = false,
  id,
  'aria-describedby': describedBy,
  className,
  onCreateNew,
  createLabel,
}: ReferenceMultiSelectProps) {
  const [query, setQuery] = useState('')

  // Keyed on the ids rather than on `value`, since the draft hands down a new
  // array on every keystroke anywhere in the form.
  const ids = value.join('\u0000')

  const chosen = useMemo<Row[]>(
    () =>
      (ids === '' ? [] : ids.split('\u0000')).map((entityId) => ({
        value: entityId,
        label: options.get(entityId) ?? `${entityId} ${MISSING_REFERENCE}`,
      })),
    [ids, options],
  )

  const rows = useMemo<Row[]>(() => {
    const taken = new Set(ids === '' ? [] : ids.split('\u0000'))
    const needle = query.trim().toLowerCase()
    const list: Row[] = []
    for (const [optionId, name] of options) {
      if (taken.has(optionId)) continue
      if (needle !== '' && !name.toLowerCase().includes(needle)) continue
      list.push({ value: optionId, label: name })
    }
    if (onCreateNew) {
      list.push({ value: CREATE_VALUE, label: createLabel ?? 'New entry', create: true })
    }
    return list
  }, [options, ids, query, onCreateNew, createLabel])

  return (
    <div data-slot="reference-select" className={cn('flex w-full flex-col gap-1.5', className)}>
      {chosen.length > 0 && (
        <TagGroup
          aria-label={`Chosen ${label}`}
          items={chosen}
          {...(disabled
            ? {}
            : {
                onRemove: (keys) => {
                  onChange(value.filter((entityId) => !keys.has(entityId)))
                },
              })}
        >
          {(row: Row) => (
            <Tag id={row.value} textValue={row.label} data-slot="reference-chip">
              <EntityLink
                entity={{ id: row.value, target, name: options.get(row.value) ?? '' }}
                navigable={false}
                className="font-mono text-data"
              />
            </Tag>
          )}
        </TagGroup>
      )}
      <ComboBox
        aria-label={label}
        items={rows}
        // **This block owns the filtering, so React Aria must not do it too.**
        // `rows` is already narrowed by `query`; React Aria's own `contains`
        // would run over the result and match on the *label*, so the create
        // row survives only while the query happens to be a substring of
        // "Add a new ...". Every other query deletes the one row an analyst
        // reaches for when nothing matched.
        defaultFilter={() => true}
        value={null}
        inputValue={query}
        onInputChange={setQuery}
        onChange={(key) => {
          setQuery('')
          if (key === null) return
          const picked = String(key)
          if (picked === CREATE_VALUE) {
            onCreateNew?.()
            return
          }
          onChange([...value, picked])
        }}
        // Shut where there is nothing to pick. An empty collection with no
        // create row answers every keystroke with an empty list, which reads
        // as broken; `onCreateNew` keeps it live even then.
        isDisabled={disabled || (options.size === 0 && !onCreateNew)}
        placeholder={value.length === 0 ? '\u2014' : ''}
        {...(id === undefined ? {} : { id })}
        {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
      >
        {(row: Row) => (
          <ListBoxItem
            id={row.value}
            textValue={row.label}
            // The row's identity, as the tags carry theirs: two rows can share
            // a display label.
            {...(row.create ? {} : { 'data-entity-id': row.value })}
            className={cn('truncate', row.create && 'mt-1 border-t text-primary')}
          >
            {row.label}
          </ListBoxItem>
        )}
      </ComboBox>
    </div>
  )
}

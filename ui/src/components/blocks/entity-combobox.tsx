import { useMemo, useState } from 'react'

import { ComboBox } from '@/components/ui/combobox'
import { MISSING_REFERENCE } from '@/components/ui/entity-ref'
import { ListBoxItem } from '@/components/ui/list-box'
import { cn } from '@/lib/cn'
import { useSearchFilter } from '@/lib/locale'

/**
 * The one picker every reference field opens: type to filter the case's rows,
 * with the create row pinned at the list's foot.
 *
 * The chevron beside the box opens the picker; it does not create. Creating is
 * the row inside, an ordinary item the filter keeps whatever the query - so it
 * is still offered when nothing matches, and it sits in the keyboard order for
 * free.
 *
 * Tabbing into the box does not open the list; a click does
 * (`openOnInputClick`).
 *
 * The keyboard vocabulary, including where it diverges from `HeaderSearch`, is
 * asserted in `entity-combobox.test.tsx`.
 */

/** The create row's key. A sentinel rather than a flag on the selection,
 *  because it travels through `onSelectionChange` as an ordinary item. */
const CREATE_VALUE = '\u0000create'

interface Row {
  value: string
  label: string
  create?: boolean
}

export interface EntityComboboxProps {
  /** The control's accessible name - what `getByRole('combobox')` matches. */
  label: string
  /** id -> display label for the target collection. See `api/refOptions.ts`. */
  options: ReadonlyMap<string, string>
  /** A row was chosen. The list shape appends; the scalar shape replaces. */
  onPick: (id: string) => void
  /**
   * The chosen id, for the scalar shape. The list shape passes none - its
   * chips carry what is chosen, and the box stays empty to add the next one.
   */
  value?: string | undefined
  /** Ids to leave out of the list, that is the chips already rendered. */
  exclude?: readonly string[] | undefined
  /** Opens the target's create dialog. Absent where creating is not offered. */
  onCreateNew?: (() => void) | undefined
  /** "New asset" - only the caller knows the noun. */
  createLabel?: string | undefined
  disabled?: boolean | undefined
  /** From `Field`'s render prop, so the label and any problem stay wired up. */
  id?: string | undefined
  'aria-describedby'?: string | undefined
  /**
   * Whether the last submit was refused on this field.
   *
   * **Declared and forwarded, because `Field` supplies it and this dropped
   * it.** A refused reference kept an ordinary border while every other
   * control in the dialog had gained a destructive one, so the one field an
   * analyst could not find by looking was the one behind a fold.
   */
  'aria-invalid'?: boolean | undefined
  className?: string | undefined
}

export function EntityCombobox({
  label,
  options,
  onPick,
  value,
  exclude,
  onCreateNew,
  createLabel,
  disabled = false,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  className,
}: EntityComboboxProps) {
  const [query, setQuery] = useState('')
  const { contains } = useSearchFilter()

  const chosen = value ?? ''
  // A stored id with no row behind it still reads as a link rather than as an
  // empty box - clearing it silently the moment the picker opens is the
  // failure the `<select>` kept a dangling `<option>` to avoid. It is a row of
  // its own because React Aria reads the box's text off the collection, so a
  // key with no row behind it shows nothing at all.
  const dangling = chosen !== '' && !options.has(chosen)
  const chosenLabel =
    chosen === '' ? '' : dangling ? `${chosen} ${MISSING_REFERENCE}` : (options.get(chosen) ?? '')

  /**
   * The box's own text is a query only while it differs from what is chosen.
   *
   * React Aria writes the picked row's label back into the box, so without
   * this the next open would be filtered down to the row already chosen.
   */
  const needle = query.trim() === '' || query === chosenLabel ? '' : query.trim()

  const skipped = (exclude ?? []).join(' ')
  const rows = useMemo<Row[]>(() => {
    const skip = new Set(skipped === '' ? [] : skipped.split(' '))
    const list: Row[] = []
    if (dangling) list.push({ value: chosen, label: chosenLabel })
    for (const [optionId, name] of options) {
      if (skip.has(optionId)) continue
      if (needle !== '' && !contains(name, needle)) continue
      list.push({ value: optionId, label: name })
    }
    // The create row survives every query; everything else is the locale-aware
    // substring match that is the whole gain over the native select's
    // prefix-only type-ahead.
    if (onCreateNew) {
      list.push({ value: CREATE_VALUE, label: createLabel ?? 'New entry', create: true })
    }
    return list
  }, [options, skipped, needle, contains, onCreateNew, createLabel, dangling, chosen, chosenLabel])

  return (
    <ComboBox
      aria-label={label}
      items={rows}
      // `value`/`onChange`, not `selectedKey`/`onSelectionChange`: React Aria
      // 1.20 deprecates the second pair for the multi-select API, and the
      // deprecation is an eslint error here.
      value={chosen === '' ? null : chosen}
      onChange={(key) => {
        if (key === null) return
        if (key === CREATE_VALUE) {
          onCreateNew?.()
          return
        }
        onPick(String(key))
      }}
      onInputChange={setQuery}
      // Off, because `rows` is already the answer. React Aria only stands its
      // own filter down when `items` is passed to the field itself, and the
      // kit hands them to the list - so the default `contains` ran a second
      // time over an already-filtered list and took the create row with it,
      // which is the one row that has to survive every query.
      defaultFilter={() => true}
      isDisabled={disabled}
      // The list stays open on a query nothing matches, because that is where
      // the create row is the only useful thing left to press.
      allowsEmptyCollection
      shouldFocusWrap
      openOnInputClick
      autoHighlight={needle !== ''}
      emptyState="Nothing matches."
      listLabel={label}
      // Opens the picker. Naming it "New ..." would promise the create row's
      // job, which is one row further in.
      triggerLabel={`Choose ${label}`}
      placeholder="&#x2014;"
      inputProps={{
        // The chosen id, for a caller that has to assert *which* row landed:
        // the box shows the display label, and two rows can share one.
        'data-selected': chosen,
        ...(id === undefined ? {} : { id }),
      }}
      {...(invalid === undefined ? {} : { isInvalid: invalid })}
      {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
      className={cn('w-full', className)}
    >
      {(row: Row) => (
        <ListBoxItem
          id={row.value}
          textValue={row.label}
          // The row's identity, as the chips carry theirs: two rows can share
          // a display label, and a test naming the id is the only one that
          // stays honest when they do.
          {...(row.create ? {} : { 'data-entity-id': row.value })}
          className={cn('truncate', row.create && 'mt-1 border-t text-primary')}
        >
          {row.label}
        </ListBoxItem>
      )}
    </ComboBox>
  )
}

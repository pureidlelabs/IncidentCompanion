import type * as React from 'react'

import { cn } from '@/lib/cn'
import { ListBoxItem } from '@/components/ui/list-box'
import { Select } from '@/components/ui/select'

/**
 * The key the blank row is picked by.
 */
const BLANK_ROW = 0

/**
 * The shape 27 of this app's 27 select call sites actually have: a served
 * vocabulary, optional labels for it, and an empty row for "not set".
 */
export function VocabSelect({
  value,
  onValueChange,
  options,
  optionLabels,
  renderValue,
  placeholder = '\u2014',
  allowEmpty = true,
  className,
  ...props
}: {
  value: string
  onValueChange: (value: string) => void
  options: readonly string[]
  optionLabels?: Readonly<Record<string, string>> | undefined
  /**
   * Draw a value as something other than its own text, in the trigger and in
   * every row - a status dot, a swatch - rather than leaving the box grey until
   * you read it.
   */
  renderValue?: ((value: string, label: string) => React.ReactNode) | undefined
  placeholder?: string
  /** Offer the blank row. False for a field the spec marks required. */
  allowEmpty?: boolean
  className?: string | undefined
  'aria-label'?: string | undefined
  /**
   * The element naming this control, which is how a `Field` names it.
   */
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
  id?: string | undefined
  disabled?: boolean | undefined
  /**
   *  testid here scopes the control, never its rows - those are found by
   */
  'data-testid'?: string | undefined
}) {
  const vocabularyHasBlank = options.includes('')
  const offerBlankRow = allowEmpty && !vocabularyHasBlank

  /** A row's words: its served label, or the value itself. */
  const labelOf = (option: string): string =>
    optionLabels?.[option] ?? (option === '' ? placeholder : option)

  /** A row's contents: the words, with the caller's mark where there is one. */
  const bodyOf = (option: string): React.ReactNode => {
    const label = labelOf(option)
    return renderValue && option !== '' ? renderValue(option, label) : label
  }

  return (
    <Select
      // Null rather than `''`: nothing is picked, so the trigger draws the
      // placeholder. A vocabulary carrying its own `''` means the opposite -
      // a member was picked - and keeps the key.
      selectedKey={value === '' && !vocabularyHasBlank ? null : value}
      onSelectionChange={(key) => {
        // `BLANK_ROW` is the only non-string key, and it means "not set".
        onValueChange(typeof key === 'string' ? key : '')
      }}
      isDisabled={props.disabled ?? false}
      placeholder={placeholder}
      // **Fills its field, as every other control does.** The trigger sized
      // itself to its content, so a select holding the blank row measured 55px
      // in a 327px column while the input above it filled. Three callers pass
      // a `max-w-*` to cap it, which is what a control expected to be wide
      // looks like from the outside; `cn` merges, so a caller's width wins.
      className={cn('w-full', className)}
      {...(props.id === undefined ? {} : { id: props.id })}
      {...(props['aria-label'] === undefined ? {} : { 'aria-label': props['aria-label'] })}
      {...(props['aria-labelledby'] === undefined
        ? {}
        : { 'aria-labelledby': props['aria-labelledby'] })}
      {...(props['aria-describedby'] === undefined
        ? {}
        : { 'aria-describedby': props['aria-describedby'] })}
      {...(props['aria-invalid'] === undefined ? {} : { isInvalid: props['aria-invalid'] })}
      {...(props['data-testid'] === undefined ? {} : { 'data-testid': props['data-testid'] })}
    >
      {offerBlankRow && (
        <ListBoxItem id={BLANK_ROW} data-value="" textValue={placeholder}>
          {placeholder}
        </ListBoxItem>
      )}
      {options.map((option) => (
        <ListBoxItem
          key={option}
          id={option}
          // The stored value, for a test that means `yes` where the row reads
          // "Yes - a person died". Same reason the combobox rows carry
          // `data-entity-id`.
          data-value={option}
          // What typeahead and the screen reader read. A row drawn through
          // `renderValue` is an element rather than a string, and React Aria
          // cannot derive the text from it.
          textValue={labelOf(option)}
        >
          {bodyOf(option)}
        </ListBoxItem>
      ))}
    </Select>
  )
}

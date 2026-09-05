import {
  DateField as AriaDateField,
  DateInput as AriaDateInput,
  DateSegment,
  composeRenderProps,
  type DateFieldProps as AriaDateFieldProps,
  type DateInputProps as AriaDateInputProps,
  type DateValue,
  type ValidationResult,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

import { Description, FieldError, Label, fieldGroup, type FieldLook } from './field'
import { composeClassName } from './rac'

/**
 * One editable part of the value: a year, a month, a day, or the separator
 * between two of them.
 *
 * `forced-color-adjust-none` keeps the focused segment legible in a forced
 * palette, where the browser would otherwise repaint the ground and leave the
 * digits on it unchanged.
 */
const segment = tv({
  base: [
    'rounded-sm px-0.5 tabular-nums outline-none forced-color-adjust-none',
    'text-ink type-literal:px-0 type-literal:text-ink-muted',
  ],
  variants: {
    isPlaceholder: { true: 'text-ink-muted' },
    isDisabled: { true: 'text-ink-muted forced-colors:text-[GrayText]' },
    isInvalid: { true: 'text-destructive' },
    isFocused: {
      true: 'bg-primary text-on-primary forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]',
    },
  },
})

export interface DateInputProps extends Omit<AriaDateInputProps, 'children'>, FieldLook {}

/**
 * The box holding a date or time field's segments.
 *
 * Renders every segment the field's granularity produces. Use it inside a
 * `DateField` or `TimeField`; on its own it has no state to read.
 */
export function DateInput({ size, ...props }: DateInputProps) {
  return (
    <AriaDateInput
      data-slot="date-input"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        fieldGroup({ ...renderProps, size, className: cn('w-fit px-2', className) }),
      )}
    >
      {(one) => <DateSegment segment={one} className={segment} />}
    </AriaDateInput>
  )
}

export interface DateFieldProps<T extends DateValue> extends AriaDateFieldProps<T>, FieldLook {
  /** The name of the field, above the segments. Without one, pass `aria-label`. */
  label?: string | undefined
  /** One line under the field. */
  description?: string | undefined
  /** Shown when validation refuses the value. */
  errorMessage?: string | ((validation: ValidationResult) => string) | undefined
}

/**
 * A date typed segment by segment, with no text parsing.
 *
 * Takes `value`/`onChange` as an `@internationalized/date` value, never a
 * `Date` or a string. `granularity` decides which segments appear;
 * `minValue`/`maxValue` bound it and drive `isInvalid`.
 */
export function DateField<T extends DateValue>({
  label,
  description,
  errorMessage,
  size,
  ...props
}: DateFieldProps<T>) {
  return (
    <AriaDateField
      data-slot="date-field"
      {...props}
      className={composeClassName(props.className, 'flex w-fit flex-col gap-1')}
    >
      {label === undefined ? null : <Label>{label}</Label>}
      {/* Spread, because `exactOptionalPropertyTypes` refuses an explicit
          `undefined` where the prop carries its own default. */}
      <DateInput {...(size === undefined ? {} : { size })} />
      {description === undefined ? null : <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaDateField>
  )
}

export { segment as dateSegmentVariants }

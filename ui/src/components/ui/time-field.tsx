import {
  TimeField as AriaTimeField,
  type TimeFieldProps as AriaTimeFieldProps,
  type TimeValue,
  type ValidationResult,
} from 'react-aria-components'

import { DateInput } from './date-field'
import { Description, FieldError, Label, type FieldLook } from './field'
import { composeClassName } from './rac'

export interface TimeFieldProps<T extends TimeValue> extends AriaTimeFieldProps<T>, FieldLook {
  /** The name of the field, above the segments. Without one, pass `aria-label`. */
  label?: string | undefined
  description?: string | undefined
  /** Shown when validation refuses the value. */
  errorMessage?: string | ((validation: ValidationResult) => string) | undefined
}

/**
 * A time typed segment by segment, with no text parsing.
 *
 * Takes `value`/`onChange` as an `@internationalized/date` `Time`,
 * `CalendarDateTime` or `ZonedDateTime`. `granularity` decides whether seconds
 * appear; `hourCycle` forces 12 or 24 hours over the locale's own choice.
 */
export function TimeField<T extends TimeValue>({
  label,
  description,
  errorMessage,
  size,
  ...props
}: TimeFieldProps<T>) {
  return (
    <AriaTimeField
      data-slot="time-field"
      {...props}
      className={composeClassName(props.className, 'flex w-fit flex-col gap-1')}
    >
      {label === undefined ? null : <Label>{label}</Label>}
      {/* Spread, because `exactOptionalPropertyTypes` refuses an explicit
          `undefined` where the prop carries its own default. */}
      <DateInput {...(size === undefined ? {} : { size })} />
      {description === undefined ? null : <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaTimeField>
  )
}

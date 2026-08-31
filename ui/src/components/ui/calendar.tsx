import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import {
  Calendar as AriaCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarHeading,
  Text,
  type CalendarProps as AriaCalendarProps,
  type DateValue,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { Button } from './button'
import { composeClassName, focusRing } from './rac'

/**
 * One day. Square on the `--control-h-md` step, so a month grid is seven
 * controls wide and lines up with the fields beside it.
 *
 * A day outside the visible month is hidden rather than dimmed: React Aria
 * still renders the cell to keep the week rows rectangular, and a second row
 * of greyed numbers reads as a second month.
 */
const cell = tv({
  extend: focusRing,
  base: [
    'flex size-(--control-h-md) cursor-default items-center justify-center',
    'rounded-md text-sm tabular-nums transition-colors forced-color-adjust-none',
  ],
  variants: {
    isSelected: {
      false: 'text-ink hover:bg-accent hover:text-on-accent pressed:bg-accent',
      true: 'bg-primary text-on-primary forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]',
    },
    isToday: { true: 'font-semibold' },
    isUnavailable: { true: 'text-destructive line-through' },
    isInvalid: { true: 'text-destructive' },
    isDisabled: { true: 'text-ink-muted/50 forced-colors:text-[GrayText]' },
    isOutsideMonth: { true: 'invisible' },
    // A read-only calendar drew exactly like an operable one, so a frozen
    // selection was found by clicking at it. The cells keep their ink -- the
    // dates are still the answer -- and lose the hover that offers a move.
    isReadOnly: { true: 'cursor-default hover:bg-transparent hover:text-ink' },
  },
  compoundVariants: [
    {
      isSelected: false,
      isToday: true,
      class: 'border border-border',
    },
    {
      isSelected: true,
      isInvalid: true,
      class: 'bg-destructive text-on-destructive forced-colors:bg-[Mark]',
    },
  ],
})

/** The weekday row above a grid. */
function GridHeader() {
  return (
    <CalendarGridHeader>
      {(day) => (
        <CalendarHeaderCell className="pb-1 text-xs font-medium text-ink-muted">
          {day}
        </CalendarHeaderCell>
      )}
    </CalendarGridHeader>
  )
}

export interface CalendarProps<T extends DateValue> extends Omit<AriaCalendarProps<T>, 'children'> {
  /** Shown under the grid when validation refuses the date. */
  errorMessage?: string | undefined
}

/**
 * A month grid a single date is picked from.
 *
 * Takes `value`/`onChange` as an `@internationalized/date` `CalendarDate`.
 * `minValue`/`maxValue` bound the range, `isDateUnavailable` marks individual
 * days unselectable, and `visibleDuration={{ months: n }}` draws `n` months
 * side by side.
 */
export function Calendar<T extends DateValue>({ errorMessage, ...props }: CalendarProps<T>) {
  const months = props.visibleDuration?.months ?? 1
  return (
    <AriaCalendar
      data-slot="calendar"
      {...props}
      className={composeClassName(props.className, 'flex w-fit max-w-full flex-col gap-2')}
    >
      <div className="flex gap-4 overflow-x-auto">
        {Array.from({ length: months }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <header className="flex items-center gap-1">
              {index === 0 ? (
                <Button variant="ghost" size="icon-sm" slot="previous" aria-label="Previous month">
                  <ChevronLeftIcon className="rtl:rotate-180" />
                </Button>
              ) : null}
              <CalendarHeading
                offset={{ months: index }}
                className="flex-1 text-center text-sm font-semibold text-ink"
              />
              {index === months - 1 ? (
                <Button variant="ghost" size="icon-sm" slot="next" aria-label="Next month">
                  <ChevronRightIcon className="rtl:rotate-180" />
                </Button>
              ) : null}
            </header>
            <CalendarGrid offset={{ months: index }} className="border-separate border-spacing-0.5">
              <GridHeader />
              <CalendarGridBody>
                {/* `data-day` is the cell's own calendar date, ISO and
                    zone-free. React Aria's only other handle is the cell's
                    accessible name, which is localised - so a test or a probe
                    matching on it asserts the harness locale as much as the
                    calendar, and the visible number repeats in the outside
                    days of the neighbouring month. */}
                {(date) => (
                  <CalendarCell
                    date={date}
                    data-day={date.toString()}
                    className={(render) => cell({ ...render, isReadOnly: props.isReadOnly ?? false })}
                  />
                )}
              </CalendarGridBody>
            </CalendarGrid>
          </div>
        ))}
      </div>
      {errorMessage === undefined ? null : (
        <Text slot="errorMessage" className="text-xs text-destructive">
          {errorMessage}
        </Text>
      )}
    </AriaCalendar>
  )
}

export { cell as calendarCellVariants }

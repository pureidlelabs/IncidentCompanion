import { CalendarDate } from '@internationalized/date'
import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/cn'

import { Button } from './button'
import { Calendar } from './calendar'
import { DialogTrigger } from './dialog'
import { Input } from './input'
import { Popover } from './popover'

/**
 * An `event_datetime` field: two typed halves and a UTC marker, never one.
 *
 * The stored shape is one ISO string, and `joinIso` assembles it from a date
 * half and a time half - so **both halves or neither**. A date with no time is
 * not a timestamp, and inventing midnight puts an event at 00:00 on a timeline
 * where that reads as a real observation.
 *
 * `+00:00`, always. There is no local-time conversion anywhere in this app to
 * mirror; `<input type="datetime-local">` would have introduced one silently.
 *
 * **Typed, not native.** Both halves
 * were `<input type="date">` and `<input type="time">`, whose *display* format
 * is the operating system's locale and can be reached by no attribute and no
 * stylesheet. On a field whose label says UTC they rendered `mm/dd/yyyy` and
 * `07:39 PM` - a twelve-hour clock on a timestamp that is definitionally
 * twenty-four-hour, and a day-month order that is ambiguous for the first
 * twelve days of every month. A text input shows what is stored.
 *
 * **Typing is the primary path and the calendar is the alternative.** An
 * analyst copying a timestamp out of a SIEM pastes it; a calendar cannot be
 * pasted into. So each half accepts free text and only commits when it parses,
 * and the popover exists for the case where the date is being chosen rather
 * than transcribed. There is no time popover: a clock face is slower than
 * typing four digits, every time.
 *
 * **Disabled rather than hidden** when its gate (`enabledBy`) is unticked:
 * hiding makes the group's height jump as the switch is ticked, and puts the
 * field beyond the harness at exactly the point it starts to matter. Nothing
 * is cleared on untick - the value is the analyst's.
 */

/**
 * The seconds and zone the stored ISO string carries.
 *
 * **`Z`, and `+00:00` was refused by the column it was written into.** Zod 4's
 * `z.iso.datetime()` accepts `Z` and refuses an offset, and every
 * `event_datetime` field is declared with the bare form - so an analyst who
 * ticked Isolated, typed a date and a time and pressed Save wrote nothing.
 * Five collections carried one.
 *
 * **The server never produced the other spelling either.** `readStamp`
 * publishes `Date.toISOString()`, which is `Z`, so a stamp read back and
 * written again did not round-trip. Widening the schema would have made both
 * spellings storable and left two in the column.
 */
const SUFFIX = ':00Z'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

export function splitIso(value: string): { date: string; time: string } {
  return { date: value.slice(0, 10), time: value.slice(11, 16) }
}

export function joinIso(date: string, time: string): string {
  return DATE.test(date) && TIME.test(time) ? `${date}T${time}${SUFFIX}` : ''
}

/**
 * `2026-08-20` as the `CalendarDate` React Aria picks in, and back.
 *
 * **A `CalendarDate` carries no time and no zone**, so the round trip is
 * arithmetic on three integers and there is no browser zone in it. Building a
 * `Date` instead needs local midnight assembled from parts:
 * `new Date('2026-08-20')` is UTC midnight, which `getDate()` reads in the
 * browser's zone, landing the calendar on the 19th for every analyst west of
 * Greenwich.
 */
function toCalendarDate(text: string): CalendarDate | undefined {
  if (!DATE.test(text)) return undefined
  const [year, month, day] = text.split('-').map(Number) as [number, number, number]
  return new CalendarDate(year, month, day)
}

function fromCalendarDate(picked: CalendarDate): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(picked.year).padStart(4, '0')}-${pad(picked.month)}-${pad(picked.day)}`
}

export interface DateTimeInputProps {
  /** The control pair's accessible name; each half is announced under it. */
  label: string
  /** One ISO string, or `''`. */
  value: string
  onChange: (iso: string) => void
  disabled?: boolean | undefined
  id?: string | undefined
  'aria-describedby'?: string | undefined
  className?: string | undefined
}

export function DateTimeInput({
  label,
  value,
  onChange,
  disabled = false,
  id,
  'aria-describedby': describedBy,
  className,
}: DateTimeInputProps) {
  /**
   * **Each half holds its own text, because a controlled input cannot be
   * typed into halfway.** `joinIso` answers `''` until both halves parse, so
   * driving the boxes from `value` alone would clear the date box on the
   * fourth keystroke of `2026`. Seeded from `value` and not resynced: the
   * draft above does not resync either, and the dialog remounts per row.
   */
  const initial = splitIso(value)
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [picking, setPicking] = useState(false)

  /**
   * What the calendar opens on, or nothing while the date is half-typed.
   *
   * Built as a typed object rather than passed inline: with
   * `exactOptionalPropertyTypes`, `value={undefined}` is a different type from
   * omitting `value`, and React Aria declares it omittable. `focusedValue` is
   * omitted with it, so an empty field opens on today rather than on epoch.
   */
  const shown: { value?: CalendarDate; defaultFocusedValue?: CalendarDate } = {}
  const onCalendar = toCalendarDate(date)
  if (onCalendar) {
    shown.value = onCalendar
    shown.defaultFocusedValue = onCalendar
  }

  const commit = (nextDate: string, nextTime: string) => {
    setDate(nextDate)
    setTime(nextTime)
    onChange(joinIso(nextDate, nextTime))
  }

  return (
    // **`flex-wrap`, because the pair has a floor and a column need not clear
    // it.** `w-40` + `w-24` + the marker is 300px, and a two-column overview
    // pane gives it 193 - all of the shortfall came off the time half, which
    // measured 22px wide holding a 59px string. Wrapping costs a row of height
    // in a pane that already scrolls; crushing costs the field.
    <div data-slot="datetime-input" className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative">
        <Input
          {...(id === undefined ? {} : { id })}
          {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
          // `inputMode="numeric"` rather than `type="number"`: the value has
          // dashes in it, and a number input silently refuses them.
          inputMode="numeric"
          aria-label={`${label} date`}
          placeholder="YYYY-MM-DD"
          disabled={disabled}
          value={date}
          className="w-40 pr-9 font-mono tabular-nums"
          onChange={(event) => {
            commit(event.target.value, time)
          }}
        />
        <DialogTrigger isOpen={picking} onOpenChange={setPicking}>
          <Button
            variant="ghost"
            size="icon"
            isDisabled={disabled}
            aria-label={`Pick ${label} from a calendar`}
            className="absolute right-0 top-0 h-full w-9 text-ink-muted"
          >
            <CalendarIcon aria-hidden />
          </Button>
          <Popover placement="bottom start" className="w-auto p-2">
            <Calendar
              aria-label={`${label} date`}
              autoFocus
              // Spread rather than passed, because `exactOptionalPropertyTypes`
              // distinguishes "absent" from "present and undefined" and React
              // Aria declares both of these optional-absent.
              {...shown}
              onChange={(picked) => {
                // **The time is defaulted here and nowhere else.** Picking a
                // day is a statement about the day; leaving the pair
                // incomplete would store nothing at all, and `joinIso` would
                // answer `''` for a date the analyst just chose.
                commit(fromCalendarDate(picked), TIME.test(time) ? time : '00:00')
                setPicking(false)
              }}
            />
          </Popover>
        </DialogTrigger>
      </div>
      <Input
        inputMode="numeric"
        aria-label={`${label} time`}
        placeholder="HH:MM"
        disabled={disabled}
        value={time}
        className="w-24 font-mono tabular-nums"
        onChange={(event) => {
          commit(date, event.target.value)
        }}
      />
      <span className="shrink-0 text-xs text-ink-muted">UTC</span>
    </div>
  )
}

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DateTimeInput, joinIso, splitIso } from './datetime-input'

/**
 * The typed date field, attacked at the two things the native inputs used to
 * guarantee for free.
 *
 * `<input type="date">` could only ever emit `YYYY-MM-DD`, so nothing had to
 * check. A text box emits whatever is typed, including a half-finished date,
 * and it emits it on every keystroke.
 */

describe('assembling the stored timestamp', () => {
  it('is one ISO string in the spelling the column accepts', () => {
    expect(joinIso('2026-08-20', '19:57')).toBe('2026-08-20T19:57:00Z')
  })

  it('round-trips through the halves it was split into', () => {
    const iso = joinIso('2026-03-04', '05:06')
    expect(splitIso(iso)).toEqual({ date: '2026-03-04', time: '05:06' })
  })

  /**
   * **A half-typed date is not a timestamp, and the predecessor stored it.**
   * `joinIso` tested both halves for truthiness only, which was sound while a
   * native picker was the only thing that could produce them: `'2026-08-2'`
   * and `'10:0'` are both truthy, and assembled into
   * `2026-08-2T10:0:00+00:00` - a string `z.iso.datetime()` refuses, from a
   * field that looked filled in. Every keystroke between `2` and `2026-08-20`
   * passes through that shape.
   */
  it.each([
    ['2026-08-2', '19:57'],
    ['2026-8-20', '19:57'],
    ['20-08-2026', '19:57'],
    ['2026-08-20', '9:57'],
    ['2026-08-20', '19:5'],
    ['2026-08-20', ''],
    ['', '19:57'],
    ['not a date', 'not a time'],
  ])('stores nothing for %j / %j', (date, time) => {
    expect(joinIso(date, time)).toBe('')
  })
})

describe('the field', () => {
  const open = (value = '') => {
    const onChange = vi.fn<(iso: string) => void>()
    render(<DateTimeInput label="Blocked at" value={value} onChange={onChange} />)
    return onChange
  }

  /**
   * The day cell for one calendar date.
   *
   * **`data-day` is the cell's own `CalendarDate`, ISO and zone-free**, so a
   * calendar shifted by a timezone renders a different key rather than a
   * differently-labelled cell. The alternative handle React Aria offers is the
   * cell's accessible name, which is localised - matching on it would assert
   * the harness locale as much as the calendar - and the visible number
   * repeats in the outside days of the neighbouring month.
   */
  const dayCell = async (day: string) => {
    let found: HTMLElement | null = null
    await waitFor(() => {
      found = document.querySelector<HTMLElement>(`[data-day="${day}"]`)
      expect(found, `no day cell for ${day}`).not.toBeNull()
    })
    return found as unknown as HTMLElement
  }

  it('shows a stored timestamp as the two halves it is made of', () => {
    open('2026-08-20T19:57:00Z')
    expect(screen.getByLabelText('Blocked at date')).toHaveValue('2026-08-20')
    expect(screen.getByLabelText('Blocked at time')).toHaveValue('19:57')
  })

  /**
   * **The box keeps what was typed while it is still being typed.**
   *
   * The value the parent holds is `''` until both halves parse, so a field
   * driven from that alone empties itself on the fourth keystroke of `2026`
   * and cannot be filled in at all. This is the assertion that a control
   * rendering perfectly in a screenshot would not survive.
   */
  it('does not clear itself part-way through a date', async () => {
    const onChange = open()
    const box = screen.getByLabelText('Blocked at date')
    await userEvent.type(box, '2026-08-20')
    expect(box).toHaveValue('2026-08-20')
    // Nothing stored yet: there is no time half.
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('stores once both halves parse, and not before', async () => {
    const onChange = open()
    await userEvent.type(screen.getByLabelText('Blocked at date'), '2026-08-20')
    expect(onChange).toHaveBeenLastCalledWith('')
    await userEvent.type(screen.getByLabelText('Blocked at time'), '19:57')
    expect(onChange).toHaveBeenLastCalledWith('2026-08-20T19:57:00Z')
  })

  /**
   * **Picking a day completes the pair, or it stores nothing.** `joinIso`
   * answers `''` without a time, so a calendar that set only the date would
   * write nothing for a day the analyst had just chosen - and the field would
   * read "Not recorded" underneath a highlighted date.
   */
  it('defaults the time when a day is picked and none was typed', async () => {
    const onChange = open()
    // Typed rather than left blank, so the month on screen is this test's
    // choice and not the day the suite happens to run.
    await userEvent.type(screen.getByLabelText('Blocked at date'), '2026-08-20')
    await userEvent.click(screen.getByLabelText('Pick Blocked at from a calendar'))
    await userEvent.click(await dayCell('2026-08-21'))
    expect(onChange).toHaveBeenLastCalledWith('2026-08-21T00:00:00Z')
  })

  /**
   * **The day that is picked is the day that is stored.**
   *
   * `toCalendarDate` builds a local midnight from the date's *parts*, because
   * `new Date('2026-08-20')` is UTC midnight and `getDate()` then reads it in
   * the browser's zone - so west of Greenwich the calendar opens on the 19th
   * and stores the 19th for a click on the 20th.
   *
   * **The suite runs at `America/New_York` so that this can fail.** The
   * container is UTC, where the broken form passes every assertion in this
   * file; `vite.config.ts` pins the harness off-UTC for exactly this reason,
   * and the pin is what these two tests are measuring.
   */
  it('opens on the stored day and stores the day that was clicked', async () => {
    const onChange = open('2026-08-20T19:57:00Z')
    await userEvent.click(screen.getByLabelText('Pick Blocked at from a calendar'))

    // The cell for the stored day is the selected one, which is the half that
    // proves the calendar *opened* on it rather than merely containing it.
    const stored = await dayCell('2026-08-20')
    expect(stored).toHaveAttribute('data-selected', 'true')

    // A different day, so this cannot pass on the deselect path below.
    await userEvent.click(await dayCell('2026-08-21'))
    expect(onChange).toHaveBeenLastCalledWith('2026-08-21T19:57:00Z')
  })

  /**
   * **Clicking the day it already holds leaves the timestamp where it was.**
   *
   * There is no such thing as un-picking a timestamp: the text box is how one
   * is emptied, and a click on the highlighted day clearing the field would
   * read as the calendar losing it. React Aria re-selects rather than
   * deselecting, so what has to be asserted is the *value*, not the absence of
   * a call - the predecessor handed back `undefined` on a second click and
   * this test read `not.toHaveBeenCalled()`, which passes just as well on a
   * calendar that has stopped reporting anything at all.
   */
  it('keeps the timestamp when the day it already holds is clicked', async () => {
    const onChange = open('2026-08-20T19:57:00Z')
    await userEvent.click(screen.getByLabelText('Pick Blocked at from a calendar'))
    await userEvent.click(await dayCell('2026-08-20'))
    for (const call of onChange.mock.calls) expect(call).toEqual(['2026-08-20T19:57:00Z'])
    expect(screen.getByLabelText('Blocked at date')).toHaveValue('2026-08-20')
    expect(screen.getByLabelText('Blocked at time')).toHaveValue('19:57')
  })

  it('refuses both halves while its gate is unticked', () => {
    render(
      <DateTimeInput label="Blocked at" value="" disabled onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText('Blocked at date')).toBeDisabled()
    expect(screen.getByLabelText('Blocked at time')).toBeDisabled()
    expect(screen.getByLabelText('Pick Blocked at from a calendar')).toBeDisabled()
  })
})

/**
 * What the pair does when the column it sits in is narrower than it is.
 *
 * **The date half is `w-40` and cannot shrink**, so the whole shortfall of a
 * column narrower than the pair comes off the time half. The date is
 * unreadable at that width and the time is unenterable, and nothing above it
 * says the pair did not fit.
 *
 * jsdom lays nothing out, so the assertion is the wrap rather than the two
 * rows; the widths are the Storybook probe's to measure.
 */
describe('a column narrower than the pair', () => {
  it('wraps the halves onto a second line rather than crushing one of them', () => {
    const { container } = render(
      <DateTimeInput label="Blocked at" value="2026-08-20T19:57:00Z" onChange={vi.fn()} />,
    )
    const pair = container.querySelector('[data-slot="datetime-input"]')

    expect(pair?.className).toMatch(/\bflex-wrap\b/)
  })
})

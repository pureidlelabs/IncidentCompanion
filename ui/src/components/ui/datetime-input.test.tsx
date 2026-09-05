import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DateTimeInput, joinIso, splitIso } from './datetime-input'

/**
 * The typed date field, attacked at the two things the native inputs used to
 * guarantee for free.
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
   * **Picking a day completes the pair, or it stores nothing.**
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

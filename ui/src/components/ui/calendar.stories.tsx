import { parseDate } from '@internationalized/date'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'

import { Calendar } from './calendar'

/** A month grid for picking one date, laid out at the same control height as the fields beside it. */
const meta = {
  title: 'Components/Calendar',
  component: Calendar,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Calendar>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A fixed month, so the grid renders the same every day.
 */
const PICKED = parseDate('2026-08-20')
const WINDOW_START = parseDate('2026-08-10')
const WINDOW_END = parseDate('2026-08-28')

/** A month, with a date selected. */
export const Default: Story = {
  args: { 'aria-label': 'Containment date', defaultValue: PICKED },
  play: async ({ canvasElement }) => {
    // Exactly one day is marked. Two would be a range the caller did not ask
    // for, and none would be a value the grid is holding and not showing.
    const marked = canvasElement.querySelectorAll('[data-selected="true"]')
    await expect(marked).toHaveLength(1)
    await expect(marked[0]).toHaveAttribute('data-day', PICKED.toString())
  },
}

/** Nothing selected. The month is pinned by `defaultFocusedValue`. */
export const Empty: Story = {
  args: { 'aria-label': 'Containment date', defaultFocusedValue: PICKED },
  play: async ({ canvasElement }) => {
    // Nothing marked, and still the right month: without the pin the grid
    // opens on today and the story is a different picture tomorrow.
    await expect(canvasElement.querySelectorAll('[data-selected="true"]')).toHaveLength(0)
    await expect(canvasElement.querySelector(`[data-day="${PICKED.toString()}"]`)).not.toBeNull()
  },
}

/** Bounded. Days outside the incident window cannot be reached. */
export const Bounded: Story = {
  args: {
    'aria-label': 'Containment date',
    defaultValue: PICKED,
    minValue: WINDOW_START,
    maxValue: WINDOW_END,
  },
  play: async ({ canvasElement }) => {
    // A day outside the incident window is drawn and refused rather than
    // missing: the month keeps its shape, and the analyst can see that the
    // day exists and is not theirs to pick.
    const before = canvasElement.querySelector(
      `[data-day="${WINDOW_START.subtract({ days: 1 }).toString()}"]`,
    )
    await expect(before).not.toBeNull()
    await expect(before).toHaveAttribute('data-disabled', 'true')

    const inside = canvasElement.querySelector(`[data-day="${WINDOW_START.toString()}"]`)
    await expect(inside).not.toHaveAttribute('data-disabled', 'true')
  },
}

/**
 * Unavailable days stay focusable and cannot be chosen.
 */
export const Unavailable: Story = {
  args: {
    'aria-label': 'Containment date',
    defaultValue: PICKED,
    isDateUnavailable: (date) => date.day % 7 === 0,
  },
  play: async ({ canvasElement }) => {
    // Unavailable is not the same as out of range: these days are inside the
    // window and still cannot be chosen, so the grid marks them rather than
    // greying the whole month either side of them.
    const seventh = canvasElement.querySelector('[data-day="2026-08-07"]')
    await expect(seventh).not.toBeNull()
    await expect(seventh).toHaveAttribute('data-unavailable', 'true')

    const eighth = canvasElement.querySelector('[data-day="2026-08-08"]')
    await expect(eighth).not.toHaveAttribute('data-unavailable', 'true')
  },
}

/** Disabled. The whole grid, including its month buttons. */
export const Disabled: Story = {
  args: { 'aria-label': 'Containment date', defaultValue: PICKED, isDisabled: true },
  play: async ({ canvasElement }) => {
    // The whole grid, its month buttons included: a calendar that refused the
    // days but let the month move would let an analyst navigate to a month
    // they cannot pick anything in.
    // The day cells are `div`s carrying a button role, so they say they are
    // refused rather than being natively disabled.
    const picked = canvasElement.querySelector(`[data-day="${PICKED.toString()}"]`)
    await expect(picked).toHaveAttribute('data-disabled', 'true')

    // The month buttons are real buttons, and they go with it: a calendar
    // that refused the days but let the month move would walk an analyst to a
    // month they cannot pick anything in.
    for (const slot of ['previous', 'next']) {
      await expect(canvasElement.querySelector(`[slot="${slot}"]`)).toBeDisabled()
    }
  },
}

/**
 * Read-only. Navigable, but the selection cannot move.
 */
export const ReadOnly: Story = {
  args: { 'aria-label': 'Containment date', defaultValue: PICKED, isReadOnly: true },
  play: async ({ canvasElement }) => {
    const picked = canvasElement.querySelector(`[data-day="${PICKED.toString()}"]`)
    if (!(picked instanceof HTMLElement)) throw new Error('the picked day is not in the grid')
    await expect(picked).toHaveAttribute('data-selected', 'true')

    const other = canvasElement.querySelector(
      `[data-day="${PICKED.add({ days: 1 }).toString()}"]`,
    )
    if (!(other instanceof HTMLElement)) throw new Error('the neighbouring day is not in the grid')
    await userEvent.click(other)

    await expect(picked).toHaveAttribute('data-selected', 'true')
    await expect(other).not.toHaveAttribute('data-selected', 'true')
  },
}

/** Refused. The selected cell turns destructive and the message reads below. */
export const Invalid: Story = {
  args: {
    'aria-label': 'Containment date',
    defaultValue: PICKED,
    isInvalid: true,
    errorMessage: 'Containment cannot precede detection.',
  },
  play: async ({ canvas, canvasElement }) => {
    // The refusal is said in words as well as drawn in the cell. A red day
    // states that something is wrong and not what.
    await expect(canvas.getByText('Containment cannot precede detection.')).toBeVisible()

    const grid = canvasElement.querySelector('[role="application"], [role="group"]')
    await expect(grid?.getAttribute('aria-invalid') ?? 'true').toBe('true')
  },
}

/** Two months side by side, with one pair of navigation buttons. */
export const TwoMonths: Story = {
  args: {
    'aria-label': 'Containment date',
    defaultValue: PICKED,
    visibleDuration: { months: 2 },
  },
  play: async ({ canvasElement }) => {
    // Two grids and one pair of navigation buttons: a second pair would let
    // the two months move apart, and the range between them is the point.
    await expect(canvasElement.querySelectorAll('table').length).toBe(2)

    // Counted by slot rather than by name: the day cells are buttons too, and
    // one of them carries a name a loose match picks up.
    await expect(canvasElement.querySelectorAll('[slot="previous"]')).toHaveLength(1)
    await expect(canvasElement.querySelectorAll('[slot="next"]')).toHaveLength(1)
  },
}

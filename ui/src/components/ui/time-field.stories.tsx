import { Time, parseZonedDateTime } from '@internationalized/date'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { TimeField } from './time-field'

/**
 * Fixed values, so the story renders the same every day.
 */
const DETECTED = new Time(14, 32)
const ZONED = parseZonedDateTime('2026-08-20T14:32:00[UTC]')

/**
 * Everything a field's group is described by, joined.
 */
function describedText(root: HTMLElement, index = 0): string {
  const group = [...root.querySelectorAll('[data-slot="date-input"]')][index]
  const ids = (group?.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  return ids
    .map((id) => document.querySelector('#' + CSS.escape(id))?.textContent ?? '')
    .join(' ')
}

/**
 * A time typed segment by segment, with no text parsing.
 */
const meta = {
  title: 'Components/TimeField',
  component: TimeField,
  parameters: { layout: 'centered' },
  args: { label: 'Detected at', defaultValue: DETECTED },
  render: (args) => <TimeField {...args} />,
} satisfies Meta<typeof TimeField>

export default meta
type Story = StoryObj<typeof meta>

/** The field, with a value, stepped one segment at a time. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const segments = canvas.getAllByRole('spinbutton')
    const hour = segments.find((one) => one.getAttribute('aria-label')?.includes('hour'))!

    hour.focus()
    const before = hour.getAttribute('aria-valuenow')
    await userEvent.keyboard('{ArrowUp}')

    await expect(hour.getAttribute('aria-valuenow')).not.toBe(before)
  },
}

/** Empty. Every segment is a placeholder until it is typed. */
export const Empty: Story = {
  args: { defaultValue: null },
}

/** The three heights, from the `--control-h-*` scale. */
export const Sizes: Story = {
  render: ({ label: _label, ...args }) => (
    <div className="flex items-end gap-4">
      <TimeField {...args} label="Small" size="sm" />
      <TimeField {...args} label="Medium" size="md" />
      <TimeField {...args} label="Large" size="lg" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const heights = [...canvasElement.querySelectorAll('[data-slot="date-input"]')].map(
      (group) => group.getBoundingClientRect().height,
    )
    await expect(heights).toHaveLength(3)
    for (let index = 1; index < heights.length; index += 1) {
      await expect(heights[index]!).toBeGreaterThan(heights[index - 1]!)
    }
  },
}

/**
 * **`hourCycle` overrides the locale, and `granularity` adds seconds.**
 */
export const Precision: Story = {
  render: ({ label: _label, defaultValue: _value, ...args }) => (
    <div className="flex flex-col gap-4">
      <TimeField {...args} label="24 hour" hourCycle={24} defaultValue={DETECTED} />
      <TimeField {...args} label="12 hour" hourCycle={12} defaultValue={DETECTED} />
      <TimeField {...args} label="To the second" granularity="second" defaultValue={DETECTED} />
      <TimeField {...args} label="Zoned" granularity="minute" defaultValue={ZONED} />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const groups = [...canvasElement.querySelectorAll('[data-slot="date-input"]')]
    const labels = (group: Element) =>
      [...group.querySelectorAll('[role="spinbutton"]')].map(
        (one) => one.getAttribute('aria-label') ?? '',
      )

    await step('Only the 12-hour field carries a day period', async () => {
      await expect(labels(groups[0]!).join(' ')).not.toMatch(/AM|PM|day period/i)
      await expect(labels(groups[1]!).join(' ')).toMatch(/AM|PM|day period/i)
    })

    await step('Seconds add a segment', async () => {
      await expect(labels(groups[2]!).length).toBeGreaterThan(labels(groups[0]!).length)
    })
  },
}

/** A line under the field, announced through `aria-describedby`. */
export const WithDescription: Story = {
  args: { description: 'The time the alert fired, not the time you opened it.' },
  play: async ({ canvasElement }) => {
    await expect(describedText(canvasElement)).toContain(
      'The time the alert fired, not the time you opened it.',
    )
  },
}

/**
 * Disabled and read-only, which differ in reachability rather than appearance.
 */
export const Disabled: Story = {
  render: ({ label: _label, ...args }) => (
    <div className="flex flex-col gap-4">
      <TimeField {...args} label="Disabled" isDisabled />
      <TimeField {...args} label="Read only" isReadOnly />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [disabled, readOnly] = [...canvasElement.querySelectorAll('[data-slot="date-input"]')]
    // `tabindex === '0'`, not "not -1": a segment with no attribute answers
    // `null`, which reads as reachable and passes for a disabled field.
    const stops = (group: Element) =>
      [...group.querySelectorAll('[role="spinbutton"]')].filter(
        (one) => one.getAttribute('tabindex') === '0',
      ).length

    await expect(stops(readOnly!)).toBeGreaterThan(0)
    await expect(stops(disabled!)).toBe(0)
  },
}

/** Refused. The segments turn destructive and the message reads under them. */
export const Invalid: Story = {
  args: {
    isInvalid: true,
    errorMessage: 'Detection cannot follow containment.',
  },
  play: async ({ canvasElement }) => {
    await expect(describedText(canvasElement)).toContain('Detection cannot follow containment.')
  },
}

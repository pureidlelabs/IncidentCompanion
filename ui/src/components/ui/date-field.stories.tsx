import { parseDate, parseDateTime } from '@internationalized/date'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'

import { Button } from './button'
import { DateField } from './date-field'
import { Form } from './form'

/**
 * A fixed date, so the story renders the same every day.
 */
const CONTAINED = parseDate('2026-08-20')
const DETECTED = parseDateTime('2026-08-20T14:32:00')

/**
 * A date typed segment by segment -- year, month, day -- rather than parsed from
 * one box.
 */
const meta = {
  title: 'Components/DateField',
  component: DateField,
  parameters: { layout: 'centered' },
  args: { label: 'Contained at', defaultValue: CONTAINED },
  render: (args) => <DateField {...args} />,
} satisfies Meta<typeof DateField>

export default meta

/**
 * Everything the field's group is described by, joined.
 */
function describedText(root: HTMLElement): string {
  const group = root.querySelector('[data-slot="date-input"]')
  const ids = (group?.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  return ids
    .map((id) => document.querySelector('#' + CSS.escape(id))?.textContent ?? '')
    .join(' ')
}
type Story = StoryObj<typeof meta>

/**
 * The field, with a value.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const segments = canvas.getAllByRole('spinbutton')
    const day = segments.find((one) => one.getAttribute('aria-label')?.includes('day'))!

    day.focus()
    const before = day.getAttribute('aria-valuenow')
    await userEvent.keyboard('{ArrowUp}')

    await expect(day.getAttribute('aria-valuenow')).not.toBe(before)
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
      <DateField {...args} label="Small" size="sm" />
      <DateField {...args} label="Medium" size="md" />
      <DateField {...args} label="Large" size="lg" />
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
 * **`granularity` decides which segments appear**, and the count is the whole
 * of what it changes.
 */
export const Granularity: Story = {
  render: ({ label: _label, defaultValue: _value, ...args }) => (
    <div className="flex flex-col gap-4">
      <DateField {...args} label="Day" defaultValue={CONTAINED} />
      <DateField {...args} label="To the minute" granularity="minute" defaultValue={DETECTED} />
      <DateField {...args} label="To the second" granularity="second" defaultValue={DETECTED} />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const groups = [...canvasElement.querySelectorAll('[data-slot="date-input"]')]
    const counts = groups.map((group) => group.querySelectorAll('[role="spinbutton"]').length)

    await step('A day has three segments', async () => {
      await expect(counts[0]).toBe(3)
    })

    await step('And each finer granularity adds more', async () => {
      await expect(counts[1]!).toBeGreaterThan(counts[0]!)
      await expect(counts[2]!).toBeGreaterThan(counts[1]!)
    })
  },
}

/** A line under the field, announced through `aria-describedby`. */
export const WithDescription: Story = {
  args: { description: 'Stored in UTC and shown in your own timezone.' },
  play: async ({ canvasElement }) => {
    await expect(describedText(canvasElement)).toContain(
      'Stored in UTC and shown in your own timezone.',
    )
  },
}

/**
 * **Disabled and read-only, which differ in reachability rather than in
 * appearance.**
 */
export const Disabled: Story = {
  render: ({ label: _label, ...args }) => (
    <div className="flex flex-col gap-4">
      <DateField {...args} label="Disabled" isDisabled />
      <DateField {...args} label="Read only" isReadOnly />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const [disabled, readOnly] = [...canvasElement.querySelectorAll('[data-slot="date-input"]')]

    await step('Both are still drawn and both keep their segments', async () => {
      await expect(disabled!.querySelectorAll('[role="spinbutton"]').length).toBeGreaterThan(0)
      await expect(readOnly!.querySelectorAll('[role="spinbutton"]').length).toBeGreaterThan(0)
    })

    await step('Read-only keeps a tab stop; disabled has none', async () => {
      // **`tabindex="0"`, not merely "not -1".** A segment with no attribute at
      // all answers `null`, which is not `-1` and so reads as reachable -- the
      // first cut of this assertion passed on the disabled field for that
      // reason.
      const stops = (group: Element) =>
        [...group.querySelectorAll('[role="spinbutton"]')].filter(
          (one) => one.getAttribute('tabindex') === '0',
        ).length

      await expect(stops(readOnly!)).toBeGreaterThan(0)
      await expect(stops(disabled!)).toBe(0)
    })
  },
}

/** Refused. The segments turn destructive and the message reads under them. */
export const Invalid: Story = {
  args: {
    isInvalid: true,
    errorMessage: 'Containment cannot precede detection.',
  },
  play: async ({ canvasElement }) => {
    await expect(describedText(canvasElement)).toContain('Containment cannot precede detection.')
  },
}

/**
 * **Bounded, and a value already outside the range is not marked at rest.**
 */
export const Bounded: Story = {
  args: {
    defaultValue: parseDate('2026-09-30'),
    minValue: parseDate('2026-08-01'),
    maxValue: parseDate('2026-08-31'),
    errorMessage: 'Pick a date inside the incident window.',
  },
  play: async ({ canvasElement }) => {
    await expect(describedText(canvasElement)).not.toContain(
      'Pick a date inside the incident window.',
    )
  },
}

/**
 * The same bounds, submitted.
 */
export const BoundedInAForm: Story = {
  render: (args) => (
    <Form validationBehavior="native">
      <DateField {...args} name="occurred" />
      <Button type="submit" size="sm">
        Save
      </Button>
    </Form>
  ),
  args: {
    label: 'Occurred',
    value: parseDate('2026-09-30'),
    minValue: parseDate('2026-08-01'),
    maxValue: parseDate('2026-08-31'),
  },
  play: async ({ canvas, step }) => {
    await step('Nothing is refused before anything is submitted', async () => {
      await expect(canvas.queryByText(/must be/i)).not.toBeInTheDocument()
    })

    await step('And the bound refuses the value on the press', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
      await waitFor(() => {
        void expect(canvas.getByText(/8\/31\/2026 or earlier/)).toBeInTheDocument()
      })
    })
  },
}

/** The same bound with the caller doing the check, for a screen wanting its own words. */
export const BoundedAndMarked: Story = {
  args: {
    defaultValue: parseDate('2026-09-30'),
    minValue: parseDate('2026-08-01'),
    maxValue: parseDate('2026-08-31'),
    isInvalid: true,
    errorMessage: 'Pick a date inside the incident window.',
  },
  play: async ({ canvasElement }) => {
    await expect(describedText(canvasElement)).toContain('Pick a date inside the incident window.')
  },
}

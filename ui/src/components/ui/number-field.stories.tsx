import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import { NumberField } from './number-field'

/**
 * A number with steppers, clamped by `minValue`/`maxValue` and moved by `step`.
 */
const meta = {
  title: 'Components/NumberField',
  component: NumberField,
  parameters: { layout: 'centered' },
  args: { label: 'Affected hosts', defaultValue: 12 },
  render: (args) => <NumberField {...args} />,
} satisfies Meta<typeof NumberField>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A label, a box and a stepper column.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('textbox', { name: 'Affected hosts' })
    box.focus()

    await userEvent.keyboard('{ArrowUp}')
    await expect(box).toHaveValue('13')

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await expect(box).toHaveValue('11')
  },
}

/** One line under the box, announced with the field. */
export const WithDescription: Story = {
  args: { description: 'Hosts the detection fired on, not hosts in scope.' },
  play: async ({ canvas, canvasElement }) => {
    const describedBy = canvas
      .getByRole('textbox', { name: 'Affected hosts' })
      .getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('Hosts the detection fired on, not hosts in scope.')
  },
}

/** The size ladder: 28, 32 and 40px. */
export const Sizes: Story = {
  render: ({ label: _label, defaultValue: _value, ...args }) => (
    <div className="flex flex-col gap-4">
      <NumberField {...args} label="Small" size="sm" defaultValue={1} />
      <NumberField {...args} label="Medium" size="md" defaultValue={2} />
      <NumberField {...args} label="Large" size="lg" defaultValue={3} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const heights = [...canvasElement.querySelectorAll('[data-slot="field-group"]')].map(
      (group) => group.getBoundingClientRect().height,
    )
    await expect(heights).toHaveLength(3)
    for (let index = 1; index < heights.length; index += 1) {
      await expect(heights[index]!).toBeGreaterThan(heights[index - 1]!)
    }
  },
}

/**
 * **`minValue`, `maxValue` and `step`, with the bound enforced rather than
 * suggested.**
 */
export const Bounds: Story = {
  args: {
    label: 'Retention, in days',
    defaultValue: 30,
    minValue: 30,
    maxValue: 365,
    step: 5,
  },
  play: async ({ canvas, step: describe, userEvent }) => {
    const box = canvas.getByRole('textbox', { name: 'Retention, in days' })
    // By name rather than by order: the increase stepper is first in the DOM,
    // which is not what the column looks like.
    const down = canvas.getByRole('button', { name: /decrease/i })
    const up = canvas.getByRole('button', { name: /increase/i })

    await describe('At the floor, the decrement is refused', async () => {
      await expect(down).toBeDisabled()
      await expect(up).not.toBeDisabled()
    })

    await describe('And a step moves by the step, not by one', async () => {
      await userEvent.click(up)
      await expect(box).toHaveValue('35')
      await expect(down).not.toBeDisabled()
    })
  },
}

/**
 * **Typing past a bound is corrected when the field is left.**
 */
export const TypingPastTheBound: Story = {
  args: {
    label: 'Retention, in days',
    defaultValue: 30,
    minValue: 30,
    maxValue: 365,
  },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('textbox', { name: 'Retention, in days' })

    await userEvent.clear(box)
    await userEvent.type(box, '900')
    await userEvent.tab()

    await waitFor(() => {
      void expect(box).toHaveValue('365')
    })
  },
}

/**
 * `formatOptions` takes `Intl.NumberFormat`'s own options, so the platform
 * formats and parses.
 */
export const Formats: Story = {
  render: ({ label: _label, defaultValue: _value, ...args }) => (
    <div className="flex flex-col gap-4">
      <NumberField
        {...args}
        label="Estimated cost"
        defaultValue={45000}
        formatOptions={{ style: 'currency', currency: 'EUR' }}
      />
      <NumberField
        {...args}
        label="Coverage"
        defaultValue={0.82}
        step={0.01}
        formatOptions={{ style: 'percent' }}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    // Formatted, not raw. A field showing `45000` where a currency was asked
    // for is a field the analyst reads as a count.
    await expect(canvas.getByRole('textbox', { name: 'Estimated cost' })).not.toHaveValue('45000')
    await expect(canvas.getByRole('textbox', { name: 'Coverage' })).toHaveValue('82%')
  },
}

/** `isDisabled` greys the box and both steppers. */
export const Disabled: Story = {
  args: { isDisabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Affected hosts' })).toBeDisabled()
    for (const stepper of canvas.getAllByRole('button')) {
      await expect(stepper).toBeDisabled()
    }
  },
}

/** `isInvalid` plus `errorMessage`, bound to the box. */
export const Invalid: Story = {
  args: {
    defaultValue: 0,
    isInvalid: true,
    errorMessage: 'Name at least one affected host.',
  },
  play: async ({ canvas, canvasElement }) => {
    const box = canvas.getByRole('textbox', { name: 'Affected hosts' })
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    const describedBy = box.getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('Name at least one affected host.')
  },
}

/** Empty, and a value far larger than the box expects. */
export const Extremes: Story = {
  render: ({ label: _label, defaultValue: _value, ...args }) => (
    <div className="flex flex-col gap-4">
      <NumberField {...args} label="Empty" />
      <NumberField {...args} label="Very large" defaultValue={987654321} />
    </div>
  ),
}

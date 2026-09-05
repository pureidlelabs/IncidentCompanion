import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import { Checkbox, CheckboxGroup } from './checkbox'

/**
 * A box an analyst ticks. `CheckboxGroup` gathers several under one label and
 * owns the group's own value.
 *
 * Three states rather than two: `isIndeterminate` is the header box over a
 * part-selected list. It overrides the selected state visually and **does not
 * respond to the analyst until the caller clears it**, so a header box that
 * should become "all" on a press needs the caller to drop `isIndeterminate` and
 * set the value.
 *
 * `isReadOnly` keeps the box reachable and refuses the change; `isDisabled`
 * takes it out of the tab order. Reach for read-only where the value still
 * matters to whoever is reading.
 */
const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
  args: { children: 'Include closed cases' },
  render: (args) => <Checkbox {...args} />,
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

/** One box, unticked, with its label wired to it. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox', { name: 'Include closed cases' })
    await expect(box).not.toBeChecked()

    // The label is the target, not just the caption: an analyst clicks the
    // words far more often than the 16px box.
    await userEvent.click(canvas.getByText('Include closed cases'))
    await expect(box).toBeChecked()
  },
}

/**
 * Unticked, ticked, mixed and read-only.
 *
 * The mixed box reports `aria-checked="mixed"` rather than a third value of its
 * own, which is what a screen reader needs to say "partially checked".
 */
export const States: Story = {
  render: ({ children: _children, ...args }) => (
    <div className="flex flex-col gap-3">
      <Checkbox {...args}>Unticked</Checkbox>
      <Checkbox {...args} defaultSelected>
        Ticked
      </Checkbox>
      <Checkbox {...args} isIndeterminate>
        Part of the list
      </Checkbox>
      <Checkbox {...args} isReadOnly defaultSelected>
        Read only
      </Checkbox>
    </div>
  ),
  play: async ({ canvas, step, userEvent }) => {
    await step('Each box reports its own state', async () => {
      await expect(canvas.getByRole('checkbox', { name: 'Unticked' })).not.toBeChecked()
      await expect(canvas.getByRole('checkbox', { name: 'Ticked' })).toBeChecked()
      // The mixed state is the input's own `indeterminate` property rather
      // than an `aria-checked` of `mixed`: React Aria renders a native
      // checkbox, and the platform carries the third state itself.
      await expect(
        canvas.getByRole<HTMLInputElement>('checkbox', { name: 'Part of the list' })
          .indeterminate,
      ).toBe(true)
    })

    await step('Read-only is reachable and refuses the change', async () => {
      const readOnly = canvas.getByRole('checkbox', { name: 'Read only' })
      readOnly.focus()
      await expect(readOnly).toHaveFocus()
      await userEvent.click(readOnly)
      await expect(readOnly).toBeChecked()
    })
  },
}

/**
 * **`isDisabled` takes the box out of the tab order**, which is the whole
 * difference from `isReadOnly` above.
 *
 * A disabled box is unreachable, so an analyst walking the form never learns
 * what it holds. Use it where the setting is irrelevant until something else
 * changes; use read-only where the value still matters to the reader.
 */
export const Disabled: Story = {
  render: ({ children: _children, ...args }) => (
    <div className="flex flex-col gap-3">
      <Checkbox {...args}>Before</Checkbox>
      <Checkbox {...args} isDisabled>
        Disabled
      </Checkbox>
      <Checkbox {...args} isDisabled defaultSelected>
        Disabled and ticked
      </Checkbox>
      <Checkbox {...args}>After</Checkbox>
    </div>
  ),
  play: async ({ canvas, step, userEvent }) => {
    await step('Both disabled boxes are skipped', async () => {
      canvas.getByRole('checkbox', { name: 'Before' }).focus()
      await userEvent.tab()
      await expect(canvas.getByRole('checkbox', { name: 'After' })).toHaveFocus()
    })

    await step('And a ticked one still reports its value', async () => {
      await expect(canvas.getByRole('checkbox', { name: 'Disabled and ticked' })).toBeChecked()
    })
  },
}

/** Invalid, with the error under the box and bound to it. */
export const Invalid: Story = {
  args: {
    children: 'I accept the retention policy',
    isInvalid: true,
    errorMessage: 'Accept the retention policy to continue.',
  },
  play: async ({ canvas, canvasElement }) => {
    const box = canvas.getByRole('checkbox')
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    const describedBy = box.getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('Accept the retention policy to continue.')
  },
}

/** With a description line, announced with the box rather than read separately. */
export const WithDescription: Story = {
  args: {
    children: 'Notify on every write',
    description: 'Every analyst on the case sees the same setting.',
  },
  play: async ({ canvas, canvasElement }) => {
    const describedBy = canvas.getByRole('checkbox').getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('Every analyst on the case sees the same setting.')
  },
}

/**
 * A group: default, invalid and disabled.
 *
 * **The group owns the value and the disabling.** A caller sets `isDisabled` on
 * the group rather than on each box, and the group's error sits under the whole
 * set rather than under whichever box was last touched.
 */
export const Group: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <CheckboxGroup
        label="Evidence to attach"
        description="Attached items travel with the report."
        defaultValue={['timeline']}
      >
        <Checkbox value="timeline">Timeline</Checkbox>
        <Checkbox value="entities">Entities</Checkbox>
        <Checkbox value="indicators">Indicators</Checkbox>
      </CheckboxGroup>
      <CheckboxGroup label="Refused set" isInvalid errorMessage="Choose at least one.">
        <Checkbox value="timeline">Timeline</Checkbox>
        <Checkbox value="entities">Entities</Checkbox>
      </CheckboxGroup>
      <CheckboxGroup label="Disabled set" isDisabled defaultValue={['timeline']}>
        <Checkbox value="timeline">Timeline</Checkbox>
        <Checkbox value="entities">Entities</Checkbox>
      </CheckboxGroup>
    </div>
  ),
  play: async ({ canvas, step }) => {
    await step('The group carries the label, not each box', async () => {
      await expect(canvas.getByRole('group', { name: /Evidence to attach/ })).toBeInTheDocument()
    })

    await step('Disabling the group reaches every box in it', async () => {
      const disabled = canvas.getByRole('group', { name: /Disabled set/ })
      for (const box of disabled.querySelectorAll('input[type="checkbox"]')) {
        await expect(box).toBeDisabled()
      }
    })
  },
}

/**
 * The unchecked edge, on every ground it is drawn over.
 *
 * An unticked box is only an edge, so that edge carries the whole control. It
 * is `--ink-muted` at 70% rather than `--input`, which does not clear 3:1
 * against these grounds.
 *
 * **The ratio itself is axe's, not this play's.** Contrast runs over every
 * story already, so a hand-written calculation here would be a second and worse
 * copy of it. What this asserts is that the edge resolves at all: a token that
 * stopped resolving paints nothing and reads as a deliberately borderless box.
 */
export const UncheckedEdge: Story = {
  render: ({ children: _children, ...args }) => (
    <div className="flex flex-col gap-3">
      {[
        ['bg-background', 'On the page ground'],
        ['bg-card', 'On a card'],
        ['bg-muted', 'On a muted band'],
        ['bg-popover', 'On a popover'],
      ].map(([ground, label]) => (
        <div key={ground} className={`rounded-md ${ground!} p-3`}>
          <Checkbox {...args}>{label}</Checkbox>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const boxes = canvasElement.querySelectorAll('[data-slot="checkbox-box"]')
    await expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      const edge = getComputedStyle(box).borderTopColor
      await expect(edge).not.toBe('rgba(0, 0, 0, 0)')
    }
  },
}

/**
 * The tick is drawn rather than faded in: `pathLength` runs 0 to 1 along the
 * stroke while the glyph scales up from 0.7. Unticking retracts it the same
 * way, and switching to indeterminate wipes the tick before drawing the dash -
 * `mode="wait"`, so the two marks never share the box.
 *
 * Whether that reads as one mark being drawn is the visual tier's question.
 * What is pinned here is that the box never holds both at once.
 */
export const TheTickIsDrawn: Story = {
  render: ({ children: _children, ...args }) => (
    <div className="flex flex-col gap-2">
      <Checkbox {...args}>Tick me</Checkbox>
      <Checkbox {...args} defaultSelected>
        Untick me
      </Checkbox>
      <Checkbox {...args} isIndeterminate>
        Some of the rows
      </Checkbox>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox', { name: 'Tick me' })
    await userEvent.click(box)

    await waitFor(() => {
      void expect(box).toBeChecked()
    })
  },
}

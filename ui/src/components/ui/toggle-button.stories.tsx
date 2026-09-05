import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bold, Italic, Star, Underline } from 'lucide-react'

import { expect, userEvent, waitFor } from 'storybook/test'

import { ToggleButton, ToggleButtonGroup } from './toggle-button'

/**
 * A button that stays pressed until pressed again, or holds one selection when
 * grouped in a `ToggleButtonGroup`.
 */
const meta = {
  title: 'Components/ToggleButton',
  component: ToggleButton,
  parameters: { layout: 'centered' },
  args: { children: null },
} satisfies Meta<typeof ToggleButton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * One toggle, holding its own state.
 */
export const Single: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <ToggleButton defaultSelected>
        <Star aria-hidden />
        Pinned
      </ToggleButton>
      <ToggleButton>
        <Star aria-hidden />
        Pin
      </ToggleButton>
      <ToggleButton variant="ghost" aria-label="Pin the entry" size="icon">
        <Star aria-hidden />
      </ToggleButton>
    </div>
  ),
  play: async ({ canvas, step }) => {
    const pinned = canvas.getByRole('button', { name: 'Pinned' })
    const pin = canvas.getByRole('button', { name: 'Pin' })

    await step('Each says whether it is pressed', async () => {
      await expect(pinned).toHaveAttribute('aria-pressed', 'true')
      await expect(pin).toHaveAttribute('aria-pressed', 'false')
    })

    await step('And pressing one leaves the other alone', async () => {
      await userEvent.click(pin)
      await expect(pin).toHaveAttribute('aria-pressed', 'true')
      await expect(pinned).toHaveAttribute('aria-pressed', 'true')
    })
  },
}

/**
 * The report's view switch: one of the two, always.
 */
export const SegmentedSingle: Story = {
  render: () => (
    <ToggleButtonGroup
      aria-label="Report view"
      defaultSelectedKeys={['outline']}
      disallowEmptySelection
    >
      <ToggleButton id="outline">Outline</ToggleButton>
      <ToggleButton id="preview">Preview</ToggleButton>
    </ToggleButtonGroup>
  ),
  play: async ({ canvas, step }) => {
    await step('A group of one choice is a group of radios', async () => {
      await expect(canvas.getAllByRole('radio')).toHaveLength(2)
      await expect(canvas.getByRole('radio', { name: 'Outline' })).toBeChecked()
    })

    await step('And pressing the selected one cannot empty it', async () => {
      await userEvent.click(canvas.getByRole('radio', { name: 'Outline' }))
      await expect(canvas.getByRole('radio', { name: 'Outline' })).toBeChecked()
    })

    await step('While pressing the other moves the choice', async () => {
      await userEvent.click(canvas.getByRole('radio', { name: 'Preview' }))
      await expect(canvas.getByRole('radio', { name: 'Preview' })).toBeChecked()
      await expect(canvas.getByRole('radio', { name: 'Outline' })).not.toBeChecked()
    })
  },
}

/**
 * A toolbar of independent toggles.
 */
export const SegmentedMultiple: Story = {
  render: () => (
    <ToggleButtonGroup
      aria-label="Text style"
      selectionMode="multiple"
      defaultSelectedKeys={['bold']}
    >
      <ToggleButton id="bold" size="icon" aria-label="Bold">
        <Bold aria-hidden />
      </ToggleButton>
      <ToggleButton id="italic" size="icon" aria-label="Italic">
        <Italic aria-hidden />
      </ToggleButton>
      <ToggleButton id="underline" size="icon" aria-label="Underline">
        <Underline aria-hidden />
      </ToggleButton>
    </ToggleButtonGroup>
  ),
  play: async ({ canvas, step }) => {
    // Buttons, not checkboxes: `multiple` leaves the toggle semantics alone and
    // only `single` swaps them for radios.
    await step('Three pressed-buttons, one of them on', async () => {
      await expect(canvas.queryAllByRole('checkbox')).toHaveLength(0)
      await expect(canvas.getAllByRole('button')).toHaveLength(3)
      await expect(canvas.getByRole('button', { name: 'Bold' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    await step('And a second joins it rather than replacing it', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Italic' }))
      await expect(canvas.getByRole('button', { name: 'Italic' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(canvas.getByRole('button', { name: 'Bold' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
  },
}

/**
 * `spaced` leaves the buttons apart, and `vertical` stacks them.
 */
export const Layouts: Story = {
  render: () => (
    <div className="flex items-start gap-6">
      <ToggleButtonGroup aria-label="Spaced view" variant="spaced" defaultSelectedKeys={['outline']}>
        <ToggleButton id="outline">Outline</ToggleButton>
        <ToggleButton id="preview">Preview</ToggleButton>
      </ToggleButtonGroup>
      <ToggleButtonGroup
        aria-label="Stacked view"
        orientation="vertical"
        defaultSelectedKeys={['preview']}
      >
        <ToggleButton id="outline">Outline</ToggleButton>
        <ToggleButton id="preview">Preview</ToggleButton>
      </ToggleButtonGroup>
    </div>
  ),
  play: async ({ canvas, step }) => {
    const groups = canvas.getAllByRole('radiogroup')
    const buttonsIn = (group: HTMLElement) => [
      ...group.querySelectorAll<HTMLElement>('[data-slot="toggle-button"]'),
    ]

    await step('The spaced pair does not touch', async () => {
      const [first, second] = buttonsIn(groups[0]!).map((b) => b.getBoundingClientRect())
      await expect(second!.left).toBeGreaterThan(first!.right)
    })

    await step('And the stacked pair runs down rather than across', async () => {
      const [first, second] = buttonsIn(groups[1]!).map((b) => b.getBoundingClientRect())
      await expect(second!.top).toBeGreaterThanOrEqual(first!.bottom - 1)
    })
  },
}

/**
 * Disabled, one button and one whole group.
 */
export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <ToggleButton isDisabled>Pin</ToggleButton>
      <ToggleButton isDisabled defaultSelected>
        Pinned
      </ToggleButton>
      <ToggleButtonGroup aria-label="Disabled view" isDisabled defaultSelectedKeys={['outline']}>
        <ToggleButton id="outline">Outline</ToggleButton>
        <ToggleButton id="preview">Preview</ToggleButton>
      </ToggleButtonGroup>
    </div>
  ),
  play: async ({ canvas, step }) => {
    await step('Every control refuses', async () => {
      for (const button of canvas.getAllByRole('button')) await expect(button).toBeDisabled()
      for (const radio of canvas.getAllByRole('radio')) await expect(radio).toBeDisabled()
    })

    await step('And the pressed one still says it is pressed', async () => {
      await expect(canvas.getByRole('button', { name: 'Pinned' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(canvas.getByRole('radio', { name: 'Outline' })).toBeChecked()
    })
  },
}

/**
 * The size ladder: 28, 32 and 40px, off the shared control heights, so a toggle
 * lines up beside a button and a field at the same rung.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <ToggleButton size="sm">Small</ToggleButton>
      <ToggleButton size="default">Default</ToggleButton>
      <ToggleButton size="lg">Large</ToggleButton>
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = canvas
      .getAllByRole('button')
      .map((button) => button.getBoundingClientRect().height)

    await expect(heights[1]).toBeGreaterThan(heights[0]!)
    await expect(heights[2]).toBeGreaterThan(heights[1]!)
  },
}

/**
 * The selected ground is one element travelling between the buttons, not a
 * background fading in and out - every toggle in a group shares one `layoutId`
 * through context, so Motion measures the two boxes and moves between them.
 */
export const TheGroundTravels: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <ToggleButtonGroup defaultSelectedKeys={['timeline']} aria-label="View">
        <ToggleButton id="timeline">Timeline</ToggleButton>
        <ToggleButton id="graph">Graph</ToggleButton>
        <ToggleButton id="table">Table</ToggleButton>
      </ToggleButtonGroup>
      <ToggleButtonGroup
        variant="spaced"
        selectionMode="multiple"
        defaultSelectedKeys={['high']}
        aria-label="Severity"
      >
        <ToggleButton id="critical">Critical</ToggleButton>
        <ToggleButton id="high">High</ToggleButton>
        <ToggleButton id="low">Low</ToggleButton>
      </ToggleButtonGroup>
    </div>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const grounds = () => canvasElement.querySelectorAll('[data-slot="toggle-button-indicator"]')

    await step('One ground for the single group, one for the multiple', async () => {
      await expect(grounds()).toHaveLength(2)
    })

    await step('And it follows the choice rather than a second appearing', async () => {
      await userEvent.click(canvas.getByRole('radio', { name: 'Graph' }))
      await waitFor(() => {
        void expect(
          canvas
            .getByRole('radio', { name: 'Graph' })
            .querySelector('[data-slot="toggle-button-indicator"]'),
        ).not.toBeNull()
      })
      await expect(grounds()).toHaveLength(2)
    })
  },
}

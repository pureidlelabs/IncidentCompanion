import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect, waitFor } from 'storybook/test'

import { ProgressBar } from './progress-bar'

/** A task running to completion, determinate with `value` or indeterminate when the end is not known. */
const meta = {
  title: 'Components/ProgressBar',
  component: ProgressBar,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ProgressBar>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A task with a known end.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const track = canvas.getByRole('progressbar').querySelector('[data-slot="progress-track"]')!
    const fill = track.querySelector('[data-slot="progress-fill"]')!

    await expect(getComputedStyle(fill).width).toBe(
      getComputedStyle(track as HTMLElement).width,
    )
    await waitFor(() => {
      void expect(
        fill.getBoundingClientRect().width / track.getBoundingClientRect().width,
      ).toBeCloseTo(0.62, 1)
    })
  },
  args: { label: 'Importing alerts', value: 62 },
  render: (args) => (
    <div className="w-80">
      <ProgressBar {...args} />
    </div>
  ),
}

/**
 * The ends of the range, which are where a spring-driven fill is worth looking
 * at: nothing at zero, and the whole groove at a hundred with no sliver of
 * track left showing past the rounding.
 */
export const Extremes: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <ProgressBar label="Not started" value={0} />
      <ProgressBar label="Half" value={50} />
      <ProgressBar label="Done" value={100} />
    </div>
  ),
  play: async ({ canvas }) => {
    const shareOf = (bar: HTMLElement) => {
      const track = bar.querySelector('[data-slot="progress-track"]')!
      return (
        track.querySelector('[data-slot="progress-fill"]')!.getBoundingClientRect().width /
        track.getBoundingClientRect().width
      )
    }
    const bars = canvas.getAllByRole('progressbar')

    await waitFor(() => {
      void expect(shareOf(bars[0]!)).toBeCloseTo(0, 1)
      void expect(shareOf(bars[2]!)).toBeCloseTo(1, 1)
    })
  },
}

/**
 * Indeterminate: the end is not known.
 */
export const Indeterminate: Story = {
  args: { label: 'Contacting the connector', isIndeterminate: true },
  render: (args) => (
    <div className="w-80">
      <ProgressBar {...args} />
    </div>
  ),
  play: async ({ canvas, step }) => {
    const bar = canvas.getByRole('progressbar')

    await step('No value is claimed, so it announces as busy', async () => {
      await expect(bar).not.toHaveAttribute('aria-valuenow')
      await expect(bar).toHaveTextContent('Contacting the connector')
    })

    await step('And the groove is full rather than part-filled', async () => {
      const track = bar.querySelector('[data-slot="progress-track"]')!
      await expect(
        track.querySelector('[data-slot="progress-fill"]')!.getBoundingClientRect().width,
      ).toBeCloseTo(track.getBoundingClientRect().width, 0)
    })
  },
}

/**
 * The three thicknesses. Only the groove changes; the readout above it does not
 * move, so a column of bars at mixed sizes stays square.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <ProgressBar label="Small" size="sm" value={62} />
      <ProgressBar label="Medium" size="md" value={62} />
      <ProgressBar label="Large" size="lg" value={62} />
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = canvas
      .getAllByRole('progressbar')
      .map((bar) =>
        bar.querySelector('[data-slot="progress-track"]')!.getBoundingClientRect().height,
      )

    await expect(heights[1]).toBeGreaterThan(heights[0]!)
    await expect(heights[2]).toBeGreaterThan(heights[1]!)
  },
}

/**
 * `formatOptions` and a range decide how the value reads, and the bar fills by
 * the range rather than by the number: 2,480 of 4,000 is the same groove as 0.62
 * of 1.
 */
export const Formatted: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <ProgressBar
        label="Rows"
        value={2480}
        maxValue={4000}
        formatOptions={{ style: 'decimal' }}
      />
      <ProgressBar label="Retention" value={0.62} maxValue={1} formatOptions={{ style: 'percent' }} />
    </div>
  ),
  play: async ({ canvas }) => {
    const bars = canvas.getAllByRole('progressbar')

    await expect(bars[0]).toHaveTextContent('2,480')
    await expect(bars[1]).toHaveTextContent('62%')
  },
}

/** Without a visible label, `aria-label` names it. */
export const Unlabelled: Story = {
  args: { value: 62, 'aria-label': 'Importing alerts' },
  render: (args) => (
    <div className="w-80">
      <ProgressBar {...args} />
    </div>
  ),
}

/**
 * `hideValue` draws the groove alone.
 */
export const HideValue: Story = {
  args: { value: 62, hideValue: true, 'aria-label': 'Importing alerts' },
  render: (args) => (
    <div className="w-80">
      <ProgressBar {...args} />
    </div>
  ),
  play: async ({ canvas, step }) => {
    const bar = canvas.getByRole('progressbar')

    await step('Nothing is drawn above the groove', async () => {
      await expect(bar).toHaveTextContent('')
      await expect(bar.querySelector('[data-slot="progress-track"]')).toBeInTheDocument()
    })

    await step('And the value is still on the element', async () => {
      await expect(bar).toHaveAttribute('aria-valuenow', '62')
    })
  },
}

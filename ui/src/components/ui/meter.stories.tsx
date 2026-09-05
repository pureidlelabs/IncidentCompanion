import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect } from 'storybook/test'

import { Meter } from './meter'

/**
 * A meter has no interactive state, so what these stories cover is the tone
 * ladder and the value formatting - both of which jsdom reports as a zero box
 * and an unstyled string.
 */
const meta = {
  title: 'Components/Meter',
  component: Meter,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Meter>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default: a label, a formatted value and a filled track.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const track = canvas.getByRole('meter').querySelector('[data-slot="meter-track"]')!
    const fill = track.firstElementChild!

    await expect(canvas.getByRole('meter')).toHaveTextContent('42%')
    await expect(
      fill.getBoundingClientRect().width / track.getBoundingClientRect().width,
    ).toBeCloseTo(0.42, 2)
  },
  args: { label: 'Evidence store', value: 42 },
  render: (args) => (
    <div className="w-80">
      <Meter {...args} />
    </div>
  ),
}

/**
 * Every tone, side by side, so one drifting from the rest is visible.
 */
export const Tones: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <Meter label="Evidence store" value={42} />
      <Meter label="Retention budget" value={76} tone="caution" />
      <Meter label="Notification window" value={94} tone="breach" />
    </div>
  ),
  play: async ({ canvas, step }) => {
    const meters = canvas.getAllByRole('meter')
    const fillOf = (meter: HTMLElement) =>
      getComputedStyle(meter.querySelector('[data-slot="meter-fill"]')!).backgroundColor

    await step('Three tones, three fills', async () => {
      await expect(new Set(meters.map((meter) => fillOf(meter))).size).toBe(3)
    })

    await step('And the breach says so in a shape as well', async () => {
      await expect(meters[2]!.querySelector('svg')).toBeInTheDocument()
      await expect(meters[0]!.querySelector('svg')).toBeNull()
    })
  },
}

/**
 * The size ladder. Only the track changes; the label row does not move.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <Meter label="Small" value={62} size="sm" />
      <Meter label="Medium" value={62} size="md" />
      <Meter label="Large" value={62} size="lg" />
    </div>
  ),
  play: async ({ canvas, step }) => {
    const meters = canvas.getAllByRole('meter')
    const trackOf = (meter: HTMLElement) =>
      meter.querySelector('[data-slot="meter-track"]')!.getBoundingClientRect().height
    const readoutOf = (meter: HTMLElement) =>
      meter.querySelector('[data-slot="meter-readout"]')!.getBoundingClientRect().height

    await step('The tracks thicken', async () => {
      const heights = meters.map((meter) => trackOf(meter))
      await expect(heights[1]).toBeGreaterThan(heights[0]!)
      await expect(heights[2]).toBeGreaterThan(heights[1]!)
    })

    await step('And the label row is the same at every rung', async () => {
      await expect(new Set(meters.map((meter) => readoutOf(meter))).size).toBe(1)
    })
  },
}

/**
 * The ends of the range, and a range that is not zero to a hundred. React Aria
 * clamps the value and formats the announcement from `formatOptions`.
 */
export const Range: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <Meter label="Empty" value={0} />
      <Meter label="Full" value={100} tone="breach" />
      <Meter label="Mailboxes reviewed" value={9} minValue={0} maxValue={12} />
      <Meter
        label="Storage used"
        value={734}
        maxValue={1024}
        formatOptions={{ style: 'unit', unit: 'gigabyte' }}
      />
    </div>
  ),
  play: async ({ canvas, step }) => {
    const meters = canvas.getAllByRole('meter')
    const shareOf = (meter: HTMLElement) => {
      const track = meter.querySelector('[data-slot="meter-track"]')!
      return (
        track.firstElementChild!.getBoundingClientRect().width /
        track.getBoundingClientRect().width
      )
    }

    await step('The ends are empty and full', async () => {
      await expect(shareOf(meters[0]!)).toBeCloseTo(0, 2)
      await expect(shareOf(meters[1]!)).toBeCloseTo(1, 2)
    })

    await step('Nine of twelve is three quarters, and reads as one', async () => {
      await expect(shareOf(meters[2]!)).toBeCloseTo(0.75, 2)
      await expect(meters[2]).toHaveTextContent('75%')
    })
  },
}

/**
 * No visible label. The meter is named by `aria-label`, which is the only other
 * way it gets an accessible name - with neither, it is announced nameless.
 */
export const LabelledByAria: Story = {
  args: { value: 42, 'aria-label': 'Evidence store' },
  render: (args) => (
    <div className="w-80">
      <Meter {...args} />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const meter = canvas.getByRole('meter', { name: 'Evidence store' })

    // Named, and no label row drawn: the readout row appears only where there
    // is something visible to put in it.
    await expect(meter).toBeInTheDocument()
    await expect(canvasElement.querySelector('label')).toBeNull()
  },
}

/**
 * A figure the number formatter cannot write.
 */
export const PairedFigure: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <Meter label="Heap" value={205} maxValue={384} valueText="205 MiB / 384 MiB" />
      <Meter
        label="Disk holding /app/evidence"
        value={62}
        maxValue={64}
        tone="breach"
        valueText="62 GiB / 64 GiB"
      />
    </div>
  ),
  play: async ({ canvas, step }) => {
    const heap = canvas.getAllByRole('meter')[0]!

    await step('The pair is what is drawn', async () => {
      await expect(heap).toHaveTextContent('205 MiB / 384 MiB')
    })

    await step('And the percentage is what is still announced', async () => {
      await expect(heap.getAttribute('aria-valuetext')).toMatch(/%$/)
    })
  },
}

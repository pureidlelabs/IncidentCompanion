import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Slider } from './slider'

/**
 * A value chosen by dragging a grip along a track, with the formatted number
 * beside its label.
 *
 * **Reach for it where the exact number matters less than the position**: a
 * confidence, a sampling rate, a window. Where an analyst knows the number they
 * want, a `NumberField` is faster and can be typed into.
 *
 * Every grip is operable from the keyboard, so the drag is one way in rather
 * than the only one. `slider.test.tsx` covers how the grips are named; these
 * cover what they do.
 */
const meta = {
  title: 'Components/Slider',
  component: Slider,
  parameters: { layout: 'centered' },
  args: { label: 'Confidence', defaultValue: 60, className: 'w-64' },
  render: (args) => <Slider {...args} />,
} satisfies Meta<typeof Slider<number>>

export default meta
type Story = StoryObj<typeof meta>

/**
 * One value.
 *
 * The `play` moves it with the arrow keys, which is the path that does not
 * need a pointer and the one a drag test cannot stand in for.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const grip = canvas.getByRole('slider', { name: 'Confidence' })
    grip.focus()

    await userEvent.keyboard('{ArrowRight}')
    await expect(grip).toHaveValue('61')

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    await expect(grip).toHaveValue('59')
  },
}

/**
 * Stepped by 10, so the grip lands only on values the caller offers.
 *
 * A slider whose step is ignored reports numbers between the ones a screen can
 * store, and the arithmetic downstream is what notices.
 */
export const Stepped: Story = {
  args: { defaultValue: 40, step: 10 },
  play: async ({ canvas, userEvent }) => {
    const grip = canvas.getByRole('slider', { name: 'Confidence' })
    grip.focus()

    await userEvent.keyboard('{ArrowRight}')
    await expect(grip).toHaveValue('50')
  },
}

/**
 * The output formatted as a percentage.
 *
 * The formatting is the analyst's, not the value's: the grip still reports
 * `0.25` to anything reading it, and the text beside the label is what they
 * see.
 */
export const Formatted: Story = {
  args: {
    label: 'Sampling',
    defaultValue: 0.25,
    minValue: 0,
    maxValue: 1,
    step: 0.05,
    formatOptions: { style: 'percent' },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('slider', { name: 'Sampling' })).toHaveValue('0.25')
    await expect(canvas.getByText('25%')).toBeInTheDocument()
  },
}

/** Disabled: the grip is not reachable and the track greys. */
export const Disabled: Story = {
  args: { isDisabled: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab()
    await expect(canvas.getByRole('slider', { name: 'Confidence' })).not.toHaveFocus()
  },
}

/**
 * **Two values, each grip named**, and neither able to pass the other.
 *
 * A range whose grips can cross reports a window that runs backwards, and every
 * screen reading it has to sort the pair before using it.
 */
export const Range: StoryObj<typeof Slider<number[]>> = {
  args: {
    label: 'Window',
    defaultValue: [20, 70],
    thumbLabels: ['Start', 'End'],
    className: 'w-64',
  },
  play: async ({ canvas, userEvent }) => {
    const start = canvas.getByRole('slider', { name: /Start/ })
    const end = canvas.getByRole('slider', { name: /End/ })

    await expect(start).toHaveValue('20')
    await expect(end).toHaveValue('70')

    // Drive the low grip up past the high one; it stops rather than crossing.
    start.focus()
    for (let press = 0; press < 60; press += 1) {
      await userEvent.keyboard('{ArrowRight}')
    }

    await expect(Number(start.getAttribute('value'))).toBeLessThanOrEqual(
      Number(end.getAttribute('value')),
    )
  },
}

/**
 * Vertical: the label and the output are hidden, and the grip is still named.
 *
 * No `aria-label` beside the `label`: React Aria points the grip's
 * `aria-labelledby` at the label element, which wins over one, so a second
 * spelling of the same name is dead weight.
 */
export const Vertical: Story = {
  args: { defaultValue: 60, orientation: 'vertical' },
  // The meta's `w-64` is a horizontal measure and says nothing standing up, so
  // it is dropped rather than set to nothing.
  render: ({ className: _className, ...args }) => <Slider {...args} />,
  play: async ({ canvas }) => {
    const grip = canvas.getByRole('slider', { name: 'Confidence' })
    await expect(grip).toHaveAttribute('aria-orientation', 'vertical')

    // **The track stands up, not the root.** The root keeps the width its
    // container gives it whichever way the slider runs, so measuring it
    // compares a 1200px box with itself and passes either way.
    const track = grip
      .closest('[data-slot="slider"]')!
      .querySelector('[data-slot="slider-track"]')!
      .getBoundingClientRect()
    await expect(track.height).toBeGreaterThan(track.width)
  },
}

/** At both ends of its range, where the grip meets the edge of the track. */
export const Extremes: Story = {
  render: ({ defaultValue: _value, label: _label, ...args }) => (
    <div className="flex flex-col gap-6">
      <Slider {...args} label="At the floor" defaultValue={0} />
      <Slider {...args} label="At the ceiling" defaultValue={100} />
    </div>
  ),
}

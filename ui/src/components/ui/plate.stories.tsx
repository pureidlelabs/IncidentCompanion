import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Plate } from './plate'

/**
 * A bordered box whose content is cut to its own corner.
 *
 * **The thing these stories exist to hold is the corner**, and it is the one
 * thing jsdom cannot see: a child with its own ground and square edges paints
 * over the arc the radius removes, and only a browser reading the pixel knows
 * whether it stopped. `probe.js` walks every story here and reports it as
 * `paints-past-the-corner`, so the grounded first child below is the case that
 * would fail if the cut were dropped. -> #914
 *
 * The radii, the tones and the stacking carry no assertion: a story pinning
 * them would fail on a plate that is working.
 */
const meta = {
  title: 'Components/Plate',
  component: Plate,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Plate>

export default meta
type Story = StoryObj<typeof meta>

const Band = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-muted px-3 py-2 text-xs font-medium text-ink-muted">{children}</div>
)

/** The case the cut is for: a grounded band with square edges, at the top. */
export const Default: Story = {
  args: {
    className: 'w-72',
    children: (
      <>
        <Band>Newest first</Band>
        <p className="px-3 py-3 text-sm text-ink">A note the analyst wrote.</p>
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const plate = canvasElement.querySelector('[data-part="plate"]')
    const content = canvasElement.querySelector('[data-part="plate-content"]')
    // The border is the plate's and the cut is the content's. Read from the
    // resolved style rather than the class, so a token that stops resolving
    // is caught here rather than at the pixel.
    await expect(getComputedStyle(plate!).borderBottomWidth).not.toBe('0px')
    await expect(getComputedStyle(content!).clipPath).not.toBe('none')
  },
}

/** Every radius the plate offers, each cutting to its own. */
export const Radii: Story = {
  args: {
    className: 'w-40',
    children: (
      <>
        <Band>Newest first</Band>
        <p className="px-3 py-3 text-sm text-ink">Cut to its own corner.</p>
      </>
    ),
  },
  render: (args) => (
    <div className="flex gap-3">
      {(['sm', 'md', 'lg'] as const).map((radius) => (
        <Plate key={radius} {...args} radius={radius} />
      ))}
    </div>
  ),
}

/** The two grounds a plate draws, beside one that leaves it to the page. */
export const Tones: Story = {
  args: {
    className: 'w-40',
    children: <p className="px-3 py-3 text-sm text-ink">A note the analyst wrote.</p>,
  },
  render: (args) => (
    <div className="flex gap-3">
      {(['surface', 'muted', 'none'] as const).map((tone) => (
        <Plate key={tone} {...args} tone={tone} />
      ))}
    </div>
  ),
}

/**
 * `clip={false}`, for a child that has to reach outside the box.
 *
 * A sticky head, or a control whose focus ring sits outside its own edge.
 * The declaration is dropped rather than zeroed: `inset(0px round 0px)` is
 * still a cut to the border box and still opens a stacking context, so a
 * zeroed corner escapes nothing.
 *
 * **Nothing grounded in the corner here, deliberately.** An uncut plate with
 * a square-edged band at its top is the defect itself, and `probe.js` would
 * report it on every walk of the kit, indistinguishable from a regression.
 */
export const Escaping: Story = {
  args: {
    clip: false,
    className: 'w-72',
    children: <p className="px-3 py-3 text-sm text-ink">A child here may paint past the corner.</p>,
  },
  play: async ({ canvasElement }) => {
    const content = canvasElement.querySelector('[data-part="plate-content"]')
    await expect(getComputedStyle(content!).clipPath).toBe('none')
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { LabelledSeparator, Separator } from './separator'

/**
 * A rule between two groups of content. `LabelledSeparator` sets a word into it,
 * as two rules either side rather than one behind.
 *
 * A vertical rule takes its height from its parent: `min-h-4` is a floor rather
 * than a size, so a plain block leaves a stub beside taller content. Spacing is
 * taken on the axis the rule divides.
 *
 * It announces itself as a boundary, so reach for it where the two sides are
 * genuinely different things. A rule that only rests the eye is a border.
 *
 * `className` is a plain string here alone: React Aria gives `Separator` no
 * render props, so it cannot take a function.
 */
const meta = {
  title: 'Components/Separator',
  component: Separator,
  parameters: { layout: 'padded' },
  args: { orientation: 'horizontal', spacing: 'none' },
  render: (args) => (
    <div className="max-w-md text-sm">
      <p>Twelve mailboxes read in bulk through the Graph API.</p>
      <Separator {...args} />
      <p>Sessions revoked across the tenant at 05:02 UTC.</p>
    </div>
  ),
} satisfies Meta<typeof Separator>

export default meta
type Story = StoryObj<typeof meta>

/** Horizontal, which is the default. */
export const Horizontal: Story = {
  args: { spacing: 'md' },
  play: async ({ canvas }) => {
    const rule = canvas.getByRole('separator')
    const box = rule.getBoundingClientRect()

    // A hairline that spans the measure. Height and width the wrong way round
    // draws a vertical rule across a paragraph and jsdom reports both as zero.
    await expect(box.height).toBeLessThanOrEqual(2)
    await expect(box.width).toBeGreaterThan(100)
  },
}

/**
 * **Vertical, in a row that gives it a height to fill.**
 *
 * A vertical separator is a zero-height box on its own: `min-h-4` is a floor
 * rather than a size, and the height comes from the row. A parent without
 * `items-stretch` leaves a 16px stub beside content twice as tall, which reads
 * as a rendering fault rather than as a missing class.
 */
export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <div className="flex items-stretch gap-2 py-4 text-2xl">
      <span>Case 4821</span>
      <Separator {...args} />
      <span>High</span>
      <Separator {...args} />
      <span>Open</span>
    </div>
  ),
  play: async ({ canvas }) => {
    const [rule] = canvas.getAllByRole('separator')
    const box = rule!.getBoundingClientRect()

    await expect(box.width).toBeLessThanOrEqual(2)
    // Taller than the `min-h-4` floor, which is what proves the row's height
    // reached it rather than the floor standing in for it.
    await expect(box.height).toBeGreaterThan(16)
  },
}

/**
 * **The spacing ladder takes its air on the axis it divides**, so a horizontal
 * rule gets vertical margin and a vertical rule gets horizontal margin.
 *
 * Those are separate compound variants, and swapping them draws a rule with air
 * along its own length - which changes nothing a reader would name and pushes
 * every neighbouring element sideways.
 */
export const Spacing: Story = {
  render: () => (
    <div className="flex flex-col gap-6 text-sm">
      {(['none', 'sm', 'md'] as const).map((spacing) => (
        <div key={spacing} data-testid={`h-${spacing}`} className="max-w-md">
          <p>Horizontal, {spacing}</p>
          <Separator spacing={spacing} />
          <p>The rule takes its air above and below.</p>
        </div>
      ))}
      {(['none', 'sm', 'md'] as const).map((spacing) => (
        <div
          key={spacing}
          data-testid={`v-${spacing}`}
          className="flex items-stretch py-2 text-sm"
        >
          <span>Vertical, {spacing}</span>
          <Separator orientation="vertical" spacing={spacing} />
          <span>air to the left and right</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas, step }) => {
    const ruleIn = (id: string) => canvas.getByTestId(id).querySelector('[data-slot="separator"]')!

    await step('A horizontal rule takes vertical margin only', async () => {
      for (const spacing of ['sm', 'md']) {
        const style = getComputedStyle(ruleIn(`h-${spacing}`))
        await expect(parseFloat(style.marginTop)).toBeGreaterThan(0)
        await expect(parseFloat(style.marginLeft)).toBe(0)
      }
    })

    await step('A vertical rule takes horizontal margin only', async () => {
      for (const spacing of ['sm', 'md']) {
        const style = getComputedStyle(ruleIn(`v-${spacing}`))
        await expect(parseFloat(style.marginLeft)).toBeGreaterThan(0)
        await expect(parseFloat(style.marginTop)).toBe(0)
      }
    })

    await step('And `none` takes none', async () => {
      const style = getComputedStyle(ruleIn('h-none'))
      await expect(parseFloat(style.marginTop)).toBe(0)
    })
  },
}

/**
 * **A rule with a word set into it, for the `or` between two ways to sign in.**
 *
 * It is two rules either side of the label rather than one behind it. A single
 * rule shows through the gaps in the glyphs, and the usual patch - a label
 * painted in the background colour - only works on a ground the label can name,
 * which a component in a kit cannot.
 */
export const Labelled: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-6">
      <LabelledSeparator>or</LabelledSeparator>
      <LabelledSeparator spacing="md">and</LabelledSeparator>
    </div>
  ),
  play: async ({ canvas }) => {
    // Two rules, because one behind the word is the thing this avoids.
    await expect(canvas.getAllByRole('separator')).toHaveLength(4)
    await expect(canvas.getByText('or')).toBeInTheDocument()
  },
}

/**
 * A rule with no height to inherit, which is the failure the `Vertical` story
 * is written against.
 *
 * The parent is a plain block rather than a stretching row, so the rule falls
 * back to its `min-h-4` floor. Kept as a story because it is what the mistake
 * looks like, and it does not look broken.
 */
export const VerticalWithoutAHeight: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <div className="text-sm">
      <Separator {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const rule = canvas.getByRole('separator')
    await expect(rule.getBoundingClientRect().height).toBeCloseTo(16, 0)
  },
}

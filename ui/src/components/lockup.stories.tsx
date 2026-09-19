import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Lockup } from './lockup'

/**
 * The mark and the name, set together.
 *
 * `Mark` keeps its own two colours on any ground; the name beside it does not,
 * and that difference is the whole of what this component adds. The About
 * dialog is the one caller.
 */
const meta = {
  title: 'Components/Lockup',
  component: Lockup,
  parameters: { layout: 'centered' },
  render: (args) => <Lockup {...args} />,
} satisfies Meta<typeof Lockup>

/**
 * The element the name is set on.
 *
 * Both the lockup's root and the name itself read `IncidentCompanion`, the
 * root because the mark beside it contributes no text -- so it is the
 * innermost of the two that carries the type, and the outer one that would
 * answer every question with the page's inherited size and ink.
 */
const nameIn = (root: HTMLElement) =>
  [...root.querySelectorAll('span')]
    .filter((one) => one.textContent === 'IncidentCompanion')
    .at(-1)!

export default meta
type Story = StoryObj<typeof meta>

/**
 * The name is type rather than an asset, which is what lets the ground theme
 * it. A raster wordmark would read identically here and to a screen reader
 * would be an empty span.
 */
export const Default: Story = {
  name: 'The lockup',
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).not.toBeNull()
    // One text node, unbroken: the name is set in two weights, and a reader
    // copying it out or searching the page gets the product's name rather
    // than two words with a boundary in the middle.
    await expect(canvasElement.textContent).toBe('IncidentCompanion')
  },
}

/**
 * The two sizes, and that they are two.
 *
 * `size` moves the mark and the name together -- a lockup whose glyph grew
 * while its name stayed put would still draw, and would read as a mistake
 * nobody could name.
 */
export const Sizes: Story = {
  name: 'Both sizes, and the name grows with the mark',
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <span data-testid="sm">
        <Lockup size="sm" />
      </span>
      <span data-testid="lg">
        <Lockup size="lg" />
      </span>
    </div>
  ),
  play: async ({ canvas }) => {
    const partsOf = (id: string) => {
      const root = canvas.getByTestId(id)
      return {
        mark: root.querySelector('svg')!.getBoundingClientRect().width,
        name: parseFloat(getComputedStyle(nameIn(root)).fontSize),
      }
    }
    const small = partsOf('sm')
    const large = partsOf('lg')

    await expect(large.mark, 'the large lockup draws the small mark').toBeGreaterThan(small.mark)
    await expect(
      large.name,
      'the mark grew and the name did not, so the two are set at different scales',
    ).toBeGreaterThan(small.name)
  },
}

/**
 * The name takes the caller's ink and the mark does not.
 *
 * This is the one property the component is built around: the unauthenticated
 * grounds would set the name muted against their field, the About dialog sets
 * it in the foreground. Two lockups that look right to a glance are what both
 * inheriting and not inheriting produce, so it is measured.
 */
export const TheNameTakesTheCallersInk: Story = {
  name: 'The name follows the caller, the mark keeps its own',
  render: () => (
    <div className="flex items-center gap-6">
      <span data-testid="muted" className="text-ink-muted">
        <Lockup />
      </span>
      <span data-testid="foreground" className="text-ink">
        <Lockup />
      </span>
    </div>
  ),
  play: async ({ canvas, step }) => {
    const nameInk = (id: string) => getComputedStyle(nameIn(canvas.getByTestId(id))).color
    const markInk = (id: string) =>
      getComputedStyle(canvas.getByTestId(id).querySelector('svg > g')!).color

    await step('the name is two inks', async () => {
      await expect(
        nameInk('muted'),
        'the name is painted the same on both grounds, so it is not taking the caller ink',
      ).not.toBe(nameInk('foreground'))
    })

    await step('and the mark is one', async () => {
      // `Mark` at its default tone resolves `currentColor` against its own
      // groups, so the glyph is identical on both. -> `mark.stories.tsx`
      await expect(markInk('muted')).toBe(markInk('foreground'))
    })
  },
}

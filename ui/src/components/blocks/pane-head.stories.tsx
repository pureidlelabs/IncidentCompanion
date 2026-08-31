import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { expect } from 'storybook/test'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pane } from '@/components/blocks/pane-head'

/**
 * The band every picker pane sits under: a title, an optional line, meta
 * beside the title, and the pane's own controls at the far end.
 *
 * **The pane owns its words, not its shape.** Title, blurb and controls are
 * data; the tiers, the gaps and the alignment are not. It takes no
 * `className`.
 *
 * The body below is a plain placeholder rather than a real table -- what this
 * block owns is the band, and a table under it would be judged instead of it.
 */
const meta = {
  title: 'Blocks/App shell/Pane head',
  component: Pane,
  parameters: { layout: 'padded' },
  args: {
    children: (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-ink-muted">
        The section body
      </div>
    ),
  },
} satisfies Meta<typeof Pane>

export default meta
type Story = StoryObj<typeof meta>

const ACTIONS = (
  <>
    <Button variant="ghost" size="sm">
      <SlidersHorizontal />
      Filter
    </Button>
    <Button size="sm">
      <Plus />
      Add
    </Button>
  </>
)

/** The least a pane can be: a heading over a body. */
export const TitleOnly: Story = {
  name: 'A title and nothing else',
  args: { title: 'Systems' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Systems' })).toBeVisible()
  },
}

/**
 * The blurb sits *under* the title rather than after it.
 *
 * On the heading's own line it reads as part of the heading; under it, it
 * reads as a line about the pane.
 */
export const WithBlurb: Story = {
  name: 'With a line under the title',
  args: {
    title: 'Systems',
    blurb: 'Hosts, servers and appliances touched by this incident.',
  },
  play: async ({ canvas }) => {
    const title = canvas.getByRole('heading', { level: 2 }).getBoundingClientRect()
    const blurb = canvas.getByText(/Hosts, servers and appliances/).getBoundingClientRect()

    // Under, not beside: its top clears the title's bottom.
    await expect(blurb.top).toBeGreaterThanOrEqual(title.bottom - 1)
  },
}

/**
 * Meta rides the title's line; the controls go to the far end.
 *
 * Meta is a count or a version rather than a control, and rides the words
 * rather than the buttons.
 */
export const WithMetaAndActions: Story = {
  name: 'Meta and the pane\u2019s controls',
  args: {
    title: 'Systems',
    blurb: 'Hosts, servers and appliances touched by this incident.',
    meta: <Badge>14 rows</Badge>,
    actions: ACTIONS,
  },
  play: async ({ canvas }) => {
    const title = canvas.getByRole('heading', { level: 2 }).getBoundingClientRect()
    const meta = canvas.getByText('14 rows').getBoundingClientRect()
    const add = canvas.getByRole('button', { name: /add/i }).getBoundingClientRect()

    // Meta shares the title's line, and sits after it.
    await expect(meta.left).toBeGreaterThan(title.left)
    await expect(meta.top).toBeLessThan(title.bottom)
    // The controls are at the other end of the band.
    await expect(add.left).toBeGreaterThan(meta.right)
  },
}

/**
 * A pane with controls draws its title at the same height as one without.
 *
 * **This is what the band exists to fix.** Under baseline alignment a 32px
 * control contributes its own text baseline, which sits lower than a bare
 * heading's, so the panes carrying a button drew their title further down than
 * the ones without -- the drift the block was written to end, reappearing
 * inside the block.
 */
export const TheTitleDoesNotMove: Story = {
  name: 'A control does not push the title down',
  args: { title: 'Systems' },
  render: (args) => (
    <div className="flex flex-col gap-6">
      <div data-testid="bare">
        <Pane {...args} />
      </div>
      <div data-testid="controlled">
        <Pane {...args} actions={ACTIONS} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const where = (id: string) => {
      const box = canvasElement.querySelector(`[data-testid="${id}"]`)!
      const head = box.querySelector('[data-slot="pane-head"]')!
      const title = box.querySelector('h2')!
      return title.getBoundingClientRect().top - head.getBoundingClientRect().top
    }

    // Measured from each band's own top, so the two panes' places on the page
    // do not enter into it.
    await expect(where('controlled')).toBeCloseTo(where('bare'), 0)
  },
}

/**
 * A blurb longer than the band is wide, including a hostname that cannot
 * break.
 *
 * The band keeps the width it was given, the blurb wraps inside its column,
 * and the controls stay inside the band rather than being carried off it.
 *
 * **What this cannot settle is whether `min-w-0` on that column is load
 * bearing.** Removing it, and removing `flex-wrap` from the band, leave every
 * assertion here true at 520px with this content. The comment on the column
 * says it stops a long blurb pushing the controls off the row; nothing at this
 * tier reproduces that, so the story asserts what it can see and says which
 * claim it is not reaching.
 */
export const ALongBlurb: Story = {
  name: 'A blurb longer than the band',
  args: {
    title: 'Systems',
    // An unbroken token is what actually tests the column: prose wraps on its
    // own, so a long sentence proves nothing about whether the column can
    // shrink. A hostname cannot break, and its width becomes the column's
    // minimum unless something says otherwise.
    blurb:
      'Hosts, servers and appliances touched by this incident, including '
      + 'srv-prod-euw1-appserver-0142.internal.example.corp and everything '
      + 'else the importer matched against the asset register.',
    meta: <Badge>142 rows</Badge>,
    actions: ACTIONS,
  },
  // A fixed width, because this is a layout claim: at whatever width the
  // canvas happens to be, the blurb may simply fit and prove nothing.
  render: (args) => (
    <div style={{ width: 520 }} data-testid="bounded">
      <Pane {...args} />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const root = canvasElement
      .querySelector('[data-testid="bounded"]')!
      .getBoundingClientRect()
    const head = canvasElement.querySelector('[data-slot="pane-head"]')!.getBoundingClientRect()
    const blurb = canvas.getByText(/srv-prod-euw1-appserver/)

    // The band stays inside what it was given rather than growing to fit the
    // blurb, which is what `min-w-0` on the text column buys.
    await expect(head.right).toBeLessThanOrEqual(root.right + 1)
    await expect(head.left).toBeGreaterThanOrEqual(root.left - 1)

    // And the blurb wrapped rather than running on one line.
    const line = Number.parseFloat(getComputedStyle(blurb).lineHeight)
    await expect(blurb.getBoundingClientRect().height).toBeGreaterThan(line * 1.5)

    // The controls are still inside the band.
    await expect(
      canvas.getByRole('button', { name: /add/i }).getBoundingClientRect().right,
    ).toBeLessThanOrEqual(head.right + 1)
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { DemosPane } from '@/components/blocks/demos-pane'
import { PICKER_DEMOS } from '@/components/blocks/picker-rows'

/**
 * The worked cases an install ships with, rebuilt on every restart.
 *
 * Tiles rather than rows, and the summary is the reason: an analyst picks a
 * demo by what it walks through, and a table row truncates that sentence to
 * nothing. So the stories that matter here are the ones that put pressure on
 * the summary -- a long one, and none at all.
 */
const meta = {
  title: 'Blocks/System/Demo cases',
  component: DemosPane,
  parameters: { layout: 'padded' },
  args: { href: (demo) => `/cases/${demo.id}/overview` },
} satisfies Meta<typeof DemosPane>

export default meta
type Story = StoryObj<typeof meta>

/** The two cases a stock install seeds. */
export const Seeded: Story = {
  name: 'The cases an install ships with',
  play: async ({ canvas, step }) => {
    await step('each tile is a door, carrying the case it opens', async () => {
      const first = canvas.getByRole('link', { name: /Worked ransomware campaign/ })
      await expect(first).toHaveAttribute('href', '/cases/demo-ransomware/overview')
    })
    await step('and the summary is drawn in full, which is why these are tiles', async () => {
      await expect(canvas.getByText(/encryption on the third night/)).toBeVisible()
    })
  },
}

/**
 * An install seeding nothing.
 *
 * A stock install has demos, so this is a deployment where they were turned
 * off. The pane says so rather than drawing an empty grid, because a blank
 * panel under a heading reads as something still loading.
 */
export const Empty: Story = {
  name: 'An install offering no demos',
  args: { demos: [] },
  play: async ({ canvas, step }) => {
    await step('the pane states the absence', async () => {
      await expect(canvas.getByText('This install offers no demo cases.')).toBeVisible()
    })
    await step('and draws no tiles at all', async () => {
      await expect(canvas.queryByRole('link')).toBeNull()
    })
  },
}

/**
 * A summary at the length the tile was sized for, against a scenario label long
 * enough to wrap away from its title.
 *
 * The title and the scenario share a baseline row that wraps, so a long
 * scenario drops below the title rather than squeezing it -- the title is the
 * thing being chosen between and keeps the width.
 */
export const Longest: Story = {
  name: 'The longest summary a demo carries',
  args: {
    demos: [
      ...PICKER_DEMOS,
      {
        id: 'demo-supply-chain',
        title: 'Managed service provider compromise',
        scenario: 'supply chain, third party access',
        scale: 'very large',
        summary:
          'A remote monitoring tool trusted by fourteen downstream tenants pushed a signed package overnight, and by the time the first customer called the same operator held domain administrator in four estates.',
      },
    ],
  },
  play: async ({ canvas, step }) => {
    await step('the long summary is drawn whole', async () => {
      await expect(canvas.getByText(/domain administrator in four estates/)).toBeVisible()
    })
    await step('and the title it belongs to is still readable beside it', async () => {
      await expect(canvas.getByText('Managed service provider compromise')).toBeVisible()
    })
  },
}

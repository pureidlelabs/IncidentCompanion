import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { NetworkScreen } from './network'
import { inACase } from '@/fixtures/in-a-case'

/**
 * Network: Addresses, domains and URLs, with the host each was seen on. **The value
 * renders verbatim**: defanging is a report-output rule, and this table shows
 * what is stored.
 *
 * **This screen is `Entity scope table` with one prop set.** The scope row, the
 * search box, the filter bar, the pager and every write are that block's, and
 * its stories own them -- including the volume and the longest value, which
 * every kind shares and none owns.
 *
 * So what is left for this file is the one thing the block cannot say: which
 * scope it is opened on, and that the scope survives a search.
 */
const meta = {
  title: 'Screens/Collect/Network',
  component: NetworkScreen,
  decorators: [inACase('network')],
  parameters: { layout: 'fullscreen' },
  args: {
    kase: campaignCase,
    specs: specsFixture,
  },
} satisfies Meta<typeof NetworkScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The campaign's rows of this kind, on its own columns. */
export const Populated: Story = {
  play: async ({ canvas, step }) => {
    await step('the shared table is opened on this kind', async () => {
      await expect(canvas.getByRole('button', { name: 'Add network' })).toBeInTheDocument()
    })
    await step('and the rows are this kind`s', async () => {
      await expect(canvas.getByText("203.0.113.43")).toBeVisible()
    })
  },
}

/**
 * Narrowed by a string.
 *
 * The search spans every kind, so what this asserts is that the scope survives
 * it: a narrowed screen is still Network, with its own add door, rather than the
 * unscoped table filtered.
 */
export const Narrowed: Story = {
  name: 'Narrowed by a search',
  args: { search: "203.0." },
  play: async ({ canvas, step }) => {
    await step('what was searched for is here', async () => {
      await expect(canvas.getByText("203.0.113.43")).toBeVisible()
    })
    await step('and the scope is unchanged by searching', async () => {
      await expect(canvas.getByRole('button', { name: 'Add network' })).toBeInTheDocument()
    })
  },
}

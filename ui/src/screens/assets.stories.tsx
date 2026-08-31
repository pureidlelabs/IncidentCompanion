import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { AssetsScreen } from './assets'
import { inACase } from '@/fixtures/in-a-case'

/**
 * Assets: Hosts, servers, mailboxes and appliances this incident touched, on the
 * columns the systems form declares.
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
  title: 'Screens/Collect/Assets',
  component: AssetsScreen,
  decorators: [inACase('assets')],
  parameters: { layout: 'fullscreen' },
  args: {
    kase: campaignCase,
    specs: specsFixture,
  },
} satisfies Meta<typeof AssetsScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The campaign's rows of this kind, on its own columns. */
export const Populated: Story = {
  play: async ({ canvas, step }) => {
    await step('the shared table is opened on this kind', async () => {
      await expect(canvas.getByRole('button', { name: 'Add asset' })).toBeInTheDocument()
    })
    await step('and the rows are this kind`s', async () => {
      await expect(canvas.getByText("DC-01")).toBeVisible()
    })
  },
}

/**
 * Narrowed by a string.
 *
 * The search spans every kind, so what this asserts is that the scope survives
 * it: a narrowed screen is still Assets, with its own add door, rather than the
 * unscoped table filtered.
 */
export const Narrowed: Story = {
  name: 'Narrowed by a search',
  args: { search: "DC-0" },
  play: async ({ canvas, step }) => {
    await step('what was searched for is here', async () => {
      await expect(canvas.getByText("DC-01")).toBeVisible()
    })
    await step('and the scope is unchanged by searching', async () => {
      await expect(canvas.getByRole('button', { name: 'Add asset' })).toBeInTheDocument()
    })
  },
}

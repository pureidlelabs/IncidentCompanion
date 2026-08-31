import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { CloudAppsScreen } from './cloud-apps'
import { inACase } from '@/fixtures/in-a-case'

/**
 * Cloud apps: Consented applications and who granted them. **The name and the instance are
 * one identity**: two tenants of one application are two rows, and the name
 * alone repeats.
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
  title: 'Screens/Collect/Cloud apps',
  component: CloudAppsScreen,
  decorators: [inACase('cloud-apps')],
  parameters: { layout: 'fullscreen' },
  args: {
    kase: campaignCase,
    specs: specsFixture,
  },
} satisfies Meta<typeof CloudAppsScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The campaign's rows of this kind, on its own columns. */
export const Populated: Story = {
  play: async ({ canvas, step }) => {
    await step('the shared table is opened on this kind', async () => {
      await expect(canvas.getByRole('button', { name: 'Add cloud app' })).toBeInTheDocument()
    })
    await step('and the rows are this kind`s', async () => {
      await expect(canvas.getByText("RemoteHands Support")).toBeVisible()
    })
  },
}

/**
 * Narrowed by a string.
 *
 * The search spans every kind, so what this asserts is that the scope survives
 * it: a narrowed screen is still Cloud apps, with its own add door, rather than the
 * unscoped table filtered.
 */
export const Narrowed: Story = {
  name: 'Narrowed by a search',
  args: { search: "RemoteHan" },
  play: async ({ canvas, step }) => {
    await step('what was searched for is here', async () => {
      await expect(canvas.getByText("RemoteHands Support")).toBeVisible()
    })
    await step('and the scope is unchanged by searching', async () => {
      await expect(canvas.getByRole('button', { name: 'Add cloud app' })).toBeInTheDocument()
    })
  },
}

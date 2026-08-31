import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { AccountsScreen } from './accounts'
import { inACase } from '@/fixtures/in-a-case'

/**
 * Accounts: identities involved in the incident.
 *
 * **This screen is `Entity scope table` with one prop set.** The scope row, the
 * search box, the filter bar, the pager and every write are that block's, and
 * its stories own them -- including the volume and the longest value, which
 * every kind shares and none owns.
 *
 * So what is left for this file is the one thing the block cannot say: which
 * scope it is opened on, and that the search still narrows once it is. The
 * `disabled`/`active` wording is drawn by the *unscoped* projection and is
 * asserted there.
 */
const meta = {
  title: 'Screens/Collect/Accounts',
  component: AccountsScreen,
  decorators: [inACase('accounts')],
  parameters: { layout: 'fullscreen' },
  args: {
    kase: campaignCase,
    specs: specsFixture,
  },
} satisfies Meta<typeof AccountsScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The campaign's accounts, on this kind's own columns. */
export const Populated: Story = {
  play: async ({ canvas, step }) => {
    await step('the shared table is opened on this kind', async () => {
      await expect(canvas.getByRole('button', { name: 'Add account' })).toBeInTheDocument()
    })
    await step('and the rows are accounts', async () => {
      await expect(canvas.getByText('p.zero@meridian.example')).toBeVisible()
    })
  },
}

/**
 * Narrowed by a string.
 *
 * The search spans every kind, so what this asserts is that the scope survives
 * it: a narrowed screen is still Accounts, with its own add door, rather than
 * the unscoped table filtered.
 */
export const Narrowed: Story = {
  name: 'Narrowed by a search',
  args: { search: 'p.zero' },
  play: async ({ canvas, step }) => {
    await step('what was searched for is here', async () => {
      await expect(canvas.getByText('p.zero@meridian.example')).toBeVisible()
    })
    await step('and the scope is unchanged by searching', async () => {
      await expect(canvas.getByRole('button', { name: 'Add account' })).toBeInTheDocument()
    })
  },
}

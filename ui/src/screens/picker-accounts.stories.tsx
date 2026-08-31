import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PICKER_ACCOUNTS } from '@/components/blocks/picker-rows'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerAccountsScreen } from './picker-accounts'

/**
 * The picker, on Accounts: who may sign in, and what each may reach.
 *
 * **The screen owns the roster.** The pane's count line and the table's tabs
 * are drawn from one list held here, so enabling or disabling an account moves
 * both; a copy held inside the table left the two counting different things.
 *
 * **The mint dialog is mounted here rather than in the container**, so the
 * gallery draws the same screen an analyst sees. A dialog a container mounts is
 * one no story can open.
 */
const meta = {
  title: 'Screens/System/Picker accounts',
  component: PickerAccountsScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="h-dvh">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: {
    analyst: 'r.okonkwo',
    accounts: PICKER_ACCOUNTS,
    userMenu: sessionRows,
    onAbout: fn(),
    roles: ['analyst', 'admin'],
    defaultRole: 'analyst',
    onCreate: fn(),
  },
} satisfies Meta<typeof PickerAccountsScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The accounts this install holds. */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-accounts')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-administration')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('the door the screen mounts opens the dialog it mounts', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'New account' }))
      await expect(await within(document.body).findByRole('dialog')).toBeInTheDocument()
    })
  },
}

/**
 * An install with one account, which is what a first boot leaves.
 *
 * The count line is withheld entirely at zero and drawn otherwise, so one is
 * the count that says which side of that the pane falls on -- and the singular
 * is what a bare `${n} accounts` gets wrong.
 */
export const OneAccount: Story = {
  name: 'One account, on a fresh install',
  args: { accounts: PICKER_ACCOUNTS.slice(0, 1) },
  play: async ({ canvas, step }) => {
    await step('the roster is counted in the singular', async () => {
      await expect(canvas.getByText(/^1 account\b/)).toBeVisible()
    })
  },
}

/**
 * The read answered with nothing at all.
 *
 * `undefined` is what a container passes before it has a list. The screen turns
 * it into an empty roster, and the pane withholds its count line rather than
 * writing a zero beside a heading.
 */
export const Absent: Story = {
  name: 'No roster to draw',
  args: { accounts: undefined },
  play: async ({ canvas, step }) => {
    await step('the pane draws, and says nothing about a count', async () => {
      await expect(canvas.getByRole('heading', { name: 'Accounts' })).toBeVisible()
      // A digit before the noun is the count line and nothing else: matching
      // the word alone catches the heading and the rail row that reaches it.
      await expect(canvas.queryByText(/\d+ account/)).toBeNull()
    })
  },
}

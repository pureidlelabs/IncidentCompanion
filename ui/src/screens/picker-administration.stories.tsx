import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PICKER_ACCOUNTS } from '@/components/blocks/picker-rows'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerAdministrationScreen } from './picker-administration'

/**
 * The picker, on Administration.
 *
 * **Four of the pane's six sections are passed nothing, on purpose.**
 * `GET /api/settings` serves the install's transport, storage and limits;
 * retention, sign-in policy and the two absent-setting lists are served by
 * nothing and written by no route. They are handed `undefined` rather than
 * filled from a sample, so the pane draws nothing where it would otherwise
 * draw an invented retention period an operator might act on. -> issue #50
 *
 * **The screen owns the roster**, so the account table's tabs and any count
 * over them read one list rather than two copies.
 */
const meta = {
  title: 'Screens/System/Picker administration',
  component: PickerAdministrationScreen,
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
  },
} satisfies Meta<typeof PickerAdministrationScreen>

export default meta
type Story = StoryObj<typeof meta>

/** What this install is set to, and what nothing serves. */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-administration')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-accounts')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('the sections nothing serves draw no invented value', async () => {
      // A retention period on screen is a number an operator would act on, so
      // an unserved one must be absent rather than plausible.
      await expect(canvas.queryByText(/90 days/)).toBeNull()
      await expect(canvas.queryByText(/Retention window/)).toBeNull()
    })
  },
}

/**
 * The read answered with no roster.
 *
 * The screen turns `undefined` into an empty list, so the account section draws
 * its own empty state rather than the pane failing around it.
 */
export const Absent: Story = {
  name: 'No roster to draw',
  args: { accounts: undefined },
  play: async ({ canvas, step }) => {
    await step('the pane draws rather than breaking on the absent roster', async () => {
      await expect(canvas.getByTestId('picker-row-administration')).toBeVisible()
    })
  },
}

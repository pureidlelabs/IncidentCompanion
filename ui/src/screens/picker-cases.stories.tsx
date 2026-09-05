import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PICKER_CASES } from '@/components/blocks/picker-rows'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerCasesScreen } from './picker-cases'

/**
 * The picker, on Your cases: where an analyst lands after signing in.
 *
 * The only picker screen whose body has doors leading to *other panes*. An
 * install holding no case offers a blank one and the demos, and neither is
 * reachable from this pane -- so the list raises them and the screen routes
 * them, which is a wiring nothing else in this file can check.
 *
 * What the list draws belongs to `Case list`; the wait and the failure to
 * `Picker frame`.
 */
const meta = {
  title: 'Screens/System/Picker cases',
  component: PickerCasesScreen,
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
    cases: PICKER_CASES,
    userMenu: sessionRows,
    onAbout: fn(),
  },
} satisfies Meta<typeof PickerCasesScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The cases this analyst can open. */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-cases')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-demos')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
  },
}

/**
 * A fresh install, with nothing in it yet.
 *
 * The two ways forward both land on another pane, so the screen answers them by
 * moving the rail rather than by drawing anything itself. A door that named the
 * right thing and went nowhere would look identical here, which is why both are
 * pressed.
 */
export const Empty: Story = {
  name: 'An install with no case in it',
  args: { cases: [], onPane: fn() },
  play: async ({ args, canvasElement, canvas, step }) => {
    // Scoped to the empty state's own offers: `New case` is also the frame's
    // header button and a rail row, so a query by name alone is satisfied by
    // the chrome on every picker screen and never reaches this pane.
    const offers = within(
      canvasElement.querySelector<HTMLElement>('[data-slot="empty-offers"]')!,
    )
    await step('both ways forward are offered here', async () => {
      await expect(canvas.getByText('No cases on this install')).toBeVisible()
    })
    await step('the blank-case door moves the rail to the New case pane', async () => {
      await userEvent.click(offers.getByRole('button', { name: /New case/ }))
      await expect(args.onPane).toHaveBeenCalledWith('new')
    })
    await step('and the demos door moves it to the demos pane', async () => {
      await userEvent.click(offers.getByRole('button', { name: /Demo cases/ }))
      await expect(args.onPane).toHaveBeenCalledWith('demos')
    })
  },
}

/**
 * The read answered with nothing at all.
 *
 * `undefined` is what a container passes before it has a list, and the screen
 * turns it into an empty one. Distinct from a failed read, which the frame
 * draws, and from an install genuinely holding no case, which is the story
 * above.
 */
export const Absent: Story = {
  name: 'No list to draw',
  args: { cases: undefined },
  play: async ({ canvas, step }) => {
    await step('the pane draws rather than breaking on the absent list', async () => {
      await expect(canvas.getByTestId('picker-row-cases')).toBeVisible()
    })
  },
}

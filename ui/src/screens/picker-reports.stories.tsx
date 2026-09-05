import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PICKER_LAYOUTS } from '@/components/blocks/picker-rows'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerReportsScreen } from './picker-reports'

/**
 * The picker, on Reports: the layouts a report can start from.
 *
 * **The one closed library of the three.** Templates and Snippets pass a
 * `newLabel` and Reports does not, so this pane draws no way to add a layout at
 * all. That difference is a single absent prop and reads as an oversight from
 * the diff, which is why it is asserted here rather than left to be noticed.
 */
const meta = {
  title: 'Screens/System/Picker reports',
  component: PickerReportsScreen,
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
    entries: PICKER_LAYOUTS,
    userMenu: sessionRows,
    onAbout: fn(),
  },
} satisfies Meta<typeof PickerReportsScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The layouts the install holds, with no door to add one. */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-reports')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-templates')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('the screen hands the library its own words', async () => {
      await expect(canvas.getByRole('heading', { name: 'Reports' })).toBeVisible()
      await expect(canvas.getByText('The layouts a report can start from.')).toBeVisible()
    })
    await step('and offers nothing to add one with, this library being closed', async () => {
      // Named by the library's own door rather than by `New`: the frame puts a
      // `New case` button in the header and another in the rail, so a loose
      // match here is satisfied by the chrome on every picker screen.
      await expect(
        canvas.queryByRole('button', { name: /written in the library editor/ }),
      ).toBeNull()
    })
  },
}

/**
 * The read answered with nothing at all.
 *
 * `undefined` is what a container passes before it has a list, and the screen
 * turns it into an empty one rather than letting it reach the library.
 */
export const Absent: Story = {
  name: 'No list to draw',
  args: { entries: undefined },
  play: async ({ canvas, step }) => {
    await step('the library draws its empty state rather than breaking', async () => {
      await expect(canvas.getByText('No layouts available')).toBeVisible()
    })
  },
}

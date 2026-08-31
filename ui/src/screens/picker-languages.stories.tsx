import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PICKER_LANGUAGES } from '@/components/blocks/picker-rows'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerLanguagesScreen } from './picker-languages'

/**
 * The picker, on Report languages.
 *
 * The pane holds its own roster so a removal is visible without a server, and
 * takes the screen's list over its held copy whenever that list changes. What
 * this screen adds is the list itself and nothing else.
 *
 * The floored coverage, the built-in that cannot be removed and the empty
 * install all belong to `Languages`.
 */
const meta = {
  title: 'Screens/System/Picker languages',
  component: PickerLanguagesScreen,
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
    languages: PICKER_LANGUAGES,
    userMenu: sessionRows,
    onAbout: fn(),
  },
} satisfies Meta<typeof PickerLanguagesScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The packs this install holds. */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-languages')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-health')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('the list reaches the pane', async () => {
      await expect(canvas.getByRole('heading', { name: 'Report languages' })).toBeVisible()
      await expect(canvas.getByText('Nederlands')).toBeVisible()
    })
  },
}

/**
 * An install carrying no pack at all.
 *
 * Reachable in practice, since a pack is a file the server stores rather than
 * something the image guarantees.
 */
export const Empty: Story = {
  name: 'No pack installed',
  args: { languages: [] },
  play: async ({ canvas, step }) => {
    await step('the pane says what a pack would buy', async () => {
      await expect(canvas.getByText('No language packs')).toBeVisible()
    })
  },
}

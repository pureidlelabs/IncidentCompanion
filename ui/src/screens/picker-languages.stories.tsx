import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SOME_KEY_COUNT, PICKER_LANGUAGES } from '@/components/blocks/picker-rows'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerLanguagesScreen } from './picker-languages'

/**
 * The picker, on Report languages.
 *
 * What this screen adds to the pane is the rail around it, so the removal
 * confirmation, the floored coverage, the built-in that cannot be removed and
 * the empty install all belong to `Languages`.
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
  // **The doors, because a control with none is not drawn.** The gallery has
  // no container, so without these the pane offers no removal and a disabled
  // upload -- a state the app never renders. -> #664
  args: {
    keyCount: SOME_KEY_COUNT,
    analyst: 'r.okonkwo',
    languages: PICKER_LANGUAGES,
    userMenu: sessionRows,
    onAbout: fn(),
    onRemove: fn(),
    onUpload: fn(),
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
      // Any other row will do; this one is read by an analyst too, which
      // Health no longer is.
      await expect(canvas.getByTestId('picker-row-cases')).not.toHaveAttribute(
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

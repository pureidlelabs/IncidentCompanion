import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerNewScreen } from './picker-new'

/**
 * The picker, on New case: the two places a case can come from.
 */
const meta = {
  title: 'Screens/System/Picker new',
  component: PickerNewScreen,
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
    userMenu: sessionRows,
    onAbout: fn(),
  },
} satisfies Meta<typeof PickerNewScreen>

export default meta
type Story = StoryObj<typeof meta>

/** Both doors, on an install with a provider configured. */
export const Default: Story = {
  args: { onBlank: fn(), onImport: fn() },
  play: async ({ args, canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-new')).toHaveAttribute('data-active', 'true')
      await expect(canvas.getByTestId('picker-row-cases')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('each tile opens the form it names, and not the other', async () => {
      await userEvent.click(canvas.getByText('Import incidents'))
      await expect(args.onImport).toHaveBeenCalledTimes(1)
      await expect(args.onBlank).not.toHaveBeenCalled()
    })
  },
}

/**
 * An install with no provider configured.
 *
 * **The import tile is drawn and refused, rather than removed.** An operator
 * who cannot see it cannot tell an install that has no importer from one where
 * the control moved, and nothing else on this pane would say so. Refused, it
 * leaves the tab order and announces itself as unavailable. -> issue #67
 */
export const NoImporter: Story = {
  name: 'Nothing to import from',
  args: { onBlank: fn() },
  play: async ({ args, canvas, step }) => {
    await step('the tile is still there, saying the feature exists', async () => {
      await expect(canvas.getByText('Import incidents')).toBeVisible()
    })
    await step('but it is refused rather than silently dead', async () => {
      const tiles = canvas.getAllByRole('button')
      const importer = tiles.find((one) => one.textContent.includes('Import incidents'))
      await expect(importer).toBeDisabled()
    })
    await step('and the door that is wired still works', async () => {
      await userEvent.click(canvas.getByText('Blank case'))
      await expect(args.onBlank).toHaveBeenCalledTimes(1)
    })
  },
}

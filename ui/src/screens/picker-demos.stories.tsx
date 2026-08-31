import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerDemosScreen } from './picker-demos'

/**
 * The picker, on Demo cases.
 *
 * **The one picker pane whose rows are links rather than calls.** A demo case
 * is seeded at server start and already exists, so a card is a route into it
 * rather than a request to build one -- which is why this screen takes an
 * `href` builder where its siblings take a handler.
 */
const meta = {
  title: 'Screens/System/Picker demos',
  component: PickerDemosScreen,
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
    href: (demo) => `/cases/${demo.id}/overview`,
  },
} satisfies Meta<typeof PickerDemosScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The worked cases this install seeds, each a door into a case that exists. */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-demos')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-cases')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('the screen builds each card`s route from the demo it draws', async () => {
      const first = canvas.getByRole('link', { name: /Worked ransomware campaign/ })
      await expect(first).toHaveAttribute('href', '/cases/demo-ransomware/overview')
    })
  },
}

/**
 * A deployment that seeds no demo case.
 *
 * The pane defaults to a worked set when the screen passes none, so an install
 * that genuinely offers nothing has to say so with an explicit empty list.
 */
export const Empty: Story = {
  name: 'An install offering no demos',
  args: { demos: [] },
  play: async ({ canvas, step }) => {
    await step('the pane states the absence', async () => {
      await expect(canvas.getByText('This install offers no demo cases.')).toBeVisible()
    })
  },
}

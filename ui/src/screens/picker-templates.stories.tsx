import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PICKER_TEMPLATES } from '@/components/blocks/picker-rows'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerTemplatesScreen } from './picker-templates'

/**
 * The picker, on Case templates.
 */
const meta = {
  title: 'Screens/System/Picker templates',
  component: PickerTemplatesScreen,
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
    entries: PICKER_TEMPLATES,
    userMenu: sessionRows,
    onAbout: fn(),
  },
} satisfies Meta<typeof PickerTemplatesScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The templates an install ships with, and the ones somebody wrote. */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-templates')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-reports')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('the screen hands the library its own words', async () => {
      // The heading and the rail row carry the same words, which is what makes
      // the destination and the pane recognisable as one place -- so the
      // heading is named by role rather than by text alone.
      await expect(canvas.getByRole('heading', { name: 'Case templates' })).toBeVisible()
      await expect(canvas.getByTestId('picker-row-templates')).toHaveTextContent(
        'Case templates',
      )
      await expect(canvas.getByText('Checklists a new case can start from.')).toBeVisible()
    })
    await step('and this library is open, so it offers the door', async () => {
      await expect(
        canvas.getByRole('button', { name: /^New template/ }),
      ).toBeInTheDocument()
    })
  },
}

/**
 * The read answered with nothing at all.
 */
export const Absent: Story = {
  name: 'No list to draw',
  args: { entries: undefined },
  play: async ({ canvas, step }) => {
    await step('the library draws its empty state rather than breaking', async () => {
      await expect(canvas.getByText('No templates available')).toBeVisible()
    })
  },
}

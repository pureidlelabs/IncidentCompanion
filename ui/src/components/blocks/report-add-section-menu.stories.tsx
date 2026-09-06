import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { ReportAddSectionMenu } from './report-add-section-menu'

/**
 * Adding a section to a report, from the served vocabulary.
 *
 * Two columns rather than one, because the registry runs to six groups of
 * kinds - a single column that long would run off the screen.
 */
const meta = {
  title: 'Blocks/Report/Add section menu',
  component: ReportAddSectionMenu,
  parameters: { layout: 'centered' },
  args: { onAddSection: () => undefined },
} satisfies Meta<typeof ReportAddSectionMenu>

export default meta
type Story = StoryObj<typeof meta>

/** The trigger, shut. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: 'Add section' })).toBeVisible()
  },
}

/** Every group the registry serves, opened in two columns. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = await canvas.findByRole('button', { name: 'Add section' })
    await userEvent.click(trigger)
    await expect(await within(document.body).findByRole('menu')).toBeVisible()
  },
}

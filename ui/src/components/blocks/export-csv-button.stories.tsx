import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { ExportCsvButton } from './export-csv-button'

/**
 * One table's CSV export.
 */
const meta = {
  title: 'Blocks/Table/Export CSV button',
  component: ExportCsvButton,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ExportCsvButton>

export default meta
type Story = StoryObj<typeof meta>

/** In the toolbar, at the size the seven sections draw it. */
export const Default: Story = {
  args: { href: '/api/cases/demo/systems.csv', filename: 'systems.csv' },
}

/**
 * The name is the section's, so a folder of exports is readable.
 */
export const Indicators: Story = {
  args: { href: '/api/cases/demo/indicators.csv', filename: 'indicators.csv' },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link')
    await expect(link).toHaveAttribute('download', 'indicators.csv')
  },
}

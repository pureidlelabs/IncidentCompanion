import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { ExportCsvButton } from './export-csv-button'

/**
 * One table's CSV export.
 *
 * **A link, not a button with an `onPress`.** The browser owns the download,
 * the session cookie rides on a same-origin navigation, and a refused request
 * saves its JSON refusal under the `.csv` name -- the gap a plain browser link
 * has with or without React. `getByRole('link')` is what a test asks for.
 *
 * It has no states of its own: it is `ButtonLink` carrying a `download`, drawn
 * in a toolbar that seven sections repeat.
 *
 * **The `download` attribute is load-bearing beyond the file name.** React
 * Aria's `RouterProvider` is mounted app-wide and takes every nested link
 * client side; `shouldClientNavigate` excludes a link that carries `download`,
 * which is the only reason this one still reaches the server.
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
 *
 * Identical to `Default` on the page, deliberately: the button has no states
 * of its own and the claim is the `download` attribute, so this one asserts
 * rather than only rendering.
 */
export const Indicators: Story = {
  args: { href: '/api/cases/demo/indicators.csv', filename: 'indicators.csv' },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link')
    await expect(link).toHaveAttribute('download', 'indicators.csv')
  },
}

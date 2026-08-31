import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PICKER_SNIPPETS } from '@/components/blocks/picker-rows'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerSnippetsScreen } from './picker-snippets'

/**
 * The picker, on Snippets: paragraphs to drop into a written section.
 *
 * The third of the three screens over one `Library collection`. Its blurb is
 * the only one naming the language a snippet is written in, because a snippet
 * is prose that ends up in a report and a report has a language; a layout and a
 * template do not.
 */
const meta = {
  title: 'Screens/System/Picker snippets',
  component: PickerSnippetsScreen,
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
    entries: PICKER_SNIPPETS,
    userMenu: sessionRows,
    onAbout: fn(),
  },
} satisfies Meta<typeof PickerSnippetsScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The snippets the install holds, and the door to write another. */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-snippets')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-reports')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('the screen hands the library its own words', async () => {
      // One heading, not two. `group` names a division inside a library that
      // has more than one; this library has one, so a group label here could
      // only repeat the pane's own name. -> issue #77
      await expect(canvas.getAllByRole('heading', { name: 'Snippets' })).toHaveLength(1)
      await expect(
        canvas.getByText(
          'Paragraphs to drop into a written section, in each language you write.',
        ),
      ).toBeVisible()
    })
    await step('and this library is open, so it offers the door', async () => {
      await expect(canvas.getByRole('button', { name: /^New snippet/ })).toBeInTheDocument()
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
      await expect(canvas.getByText('No snippets available')).toBeVisible()
    })
  },
}

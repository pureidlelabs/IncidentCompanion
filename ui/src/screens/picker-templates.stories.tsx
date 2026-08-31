import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PICKER_TEMPLATES } from '@/components/blocks/picker-rows'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerTemplatesScreen } from './picker-templates'

/**
 * The picker, on Case templates.
 *
 * One of three screens drawing the same `Library collection` and differing only
 * in the words they hand it and in whether the library is open. The words are
 * what these stories hold, because a copy-paste between the three is invisible
 * to every other tier: the wrong noun still renders, still passes, and still
 * reads as a sentence.
 *
 * What the library itself does with those words -- the search threshold, the
 * empty states, the duplicate -- belongs to `Library collection`, and the wait
 * and the failure belong to `Picker frame`.
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
 *
 * `undefined` is what a container passes before it has a list, and the screen
 * turns it into an empty one rather than letting it reach the library. That is
 * this screen's own conversion: a failed read is a different state, drawn by
 * the frame, and an install genuinely holding no template is a third.
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

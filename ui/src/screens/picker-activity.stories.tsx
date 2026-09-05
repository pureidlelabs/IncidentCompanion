import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PICKER_AUDIT } from '@/components/blocks/picker-rows'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import { PickerActivityScreen } from './picker-activity'

/**
 * The picker, on Activity: the installation's own log.
 *
 * **The clock is read once, on mount.** A `Date.now()` in the render body is
 * impure, and a relative time that shifts because the pane happened to
 * re-render is a different number for no reason the analyst caused. A caller
 * that wants a fixed one passes `now`, which is what these stories do -- a log
 * of relative times is otherwise a different screen every day.
 *
 * The ranges, the pager and the grouping belong to `Activity log`.
 */
const meta = {
  title: 'Screens/System/Picker activity',
  component: PickerActivityScreen,
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
    audit: PICKER_AUDIT,
    userMenu: sessionRows,
    onAbout: fn(),
  },
} satisfies Meta<typeof PickerActivityScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The log, read against a fixed clock so the story says the same thing twice. */
export const Default: Story = {
  args: { now: Date.parse('2026-03-14T12:00:00Z') },
  play: async ({ canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-activity')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-accounts')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('the log is drawn', async () => {
      await expect(canvas.getByRole('heading', { name: /Activity/ })).toBeVisible()
    })
  },
}

/**
 * An install nobody has done anything on yet.
 *
 * `undefined` is what a container passes before it has a log; the screen turns
 * it into an empty one. A log with nothing in it is a true answer on a fresh
 * install rather than a failure, which the frame would draw instead.
 */
export const Absent: Story = {
  name: 'Nothing logged yet',
  args: { audit: undefined, now: Date.parse('2026-03-14T12:00:00Z') },
  play: async ({ canvas, step }) => {
    await step('the pane draws rather than breaking on the absent log', async () => {
      await expect(canvas.getByTestId('picker-row-activity')).toBeVisible()
      await expect(canvas.getByRole('heading', { name: /Activity/ })).toBeVisible()
    })
  },
}

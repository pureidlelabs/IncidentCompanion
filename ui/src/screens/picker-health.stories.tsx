import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { sessionRows } from '@/fixtures/railMenus'
import { MemoryRouter } from 'react-router-dom'

import {
  PICKER_CONNECTIONS,
  PICKER_FIGURES,
  PICKER_GAUGES,
  PICKER_SERVING,
  PICKER_TABLES,
  PICKER_UPTIME,
  REDIS_DOWN_NOTE,
} from '@/components/blocks/picker-rows'
import { PickerHealthScreen } from './picker-health'

/**
 * The picker, on Health.
 *
 * **The one pane reachable from two places.** The rail lists it under SYSTEM,
 * and the product card at the rail's head opens it too -- because an operator
 * asking whether the install is coping is often not in the rail at all.
 *
 * The pane's own states -- a dependency gone, a gauge past its ceiling, a fresh
 * install -- belong to `Health`. This screen takes the whole answer as one
 * object and adds nothing to it.
 */
const meta = {
  title: 'Screens/System/Picker health',
  component: PickerHealthScreen,
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
    health: {
      uptime: PICKER_UPTIME,
      serving: PICKER_SERVING,
      gauges: PICKER_GAUGES,
      connections: PICKER_CONNECTIONS,
      figures: PICKER_FIGURES,
      tables: PICKER_TABLES,
    },
    onAbout: fn(),
  },
} satisfies Meta<typeof PickerHealthScreen>

export default meta
type Story = StoryObj<typeof meta>

/** What this install is doing, with Redis refusing connections. */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    await step('the rail is lit on this pane and no other', async () => {
      await expect(canvas.getByTestId('picker-row-health')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-accounts')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('the whole answer reaches the pane, not a part of it', async () => {
      await expect(canvas.getByText(PICKER_UPTIME)).toBeVisible()
      await expect(canvas.getByText(REDIS_DOWN_NOTE)).toBeVisible()
    })
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { CaseKeyTimesSheet } from './case-key-times-sheet'

/**
 * The five stage times, over whatever screen the analyst is on.
 */
const meta = {
  title: 'Blocks/Overlay/Case key times',
  component: CaseKeyTimesSheet,
  parameters: { layout: 'centered' },
  args: { kase: campaignCase, specs: specsFixture },
} satisfies Meta<typeof CaseKeyTimesSheet>

export default meta
type Story = StoryObj<typeof meta>

/** Its own docs frame, `height` tall, so a modal panel can arrive open. */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/** The trigger alone, as the header carries it. */
export const Closed: Story = { name: 'The trigger in the header' }

/** Pressed: the panel arrives with the five stamps in it. */
export const Open: Story = {
  name: 'The panel open',
  parameters: frame('560px'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /Key times/ }))
    // The panel is a modal and renders outside the canvas element, and it
    // slides in - so the field is in the document a frame before it is painted.
    const field = await within(document.body).findByLabelText('Contained at')
    await waitFor(async () => {
      await expect(field).toBeVisible()
    })
  },
}

/**
 * A stamp another analyst wrote first.
 */
export const Refused: Story = {
  name: 'A write another analyst refused',
  parameters: frame('560px'),
  args: { isOpen: true, refusal: { field: 'Contained at', by: 'A. Okonkwo' } },
}

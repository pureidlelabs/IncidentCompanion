import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { AuthCorner } from './auth-corner'

/**
 * The cluster every unauthenticated screen carries in its top corner.
 *
 * **It lived inside `sign-in.tsx`, and the other two auth screens imported it
 * from there.** That made the sign-in screen a library nobody had declared:
 * neither the forced password change nor first run could be read or moved
 * without it, and a screen is meant to be a leaf. What two screens share is a
 * block.
 *
 * It renders after the form in the DOM and is positioned into the corner, so
 * the first tab stop is the credential rather than a control somebody touches
 * once a day.
 */
const meta = {
  title: 'Blocks/Auth/Corner',
  component: AuthCorner,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AuthCorner>

export default meta
type Story = StoryObj<typeof meta>

/** The two controls, and never more than the two. */
export const Bare: Story = {
  name: 'Theme and an About door',
  play: async ({ canvas, canvasElement, step }) => {
    await step('the About door opens the dialog', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'About IncidentCompanion' }))
      const screen = within(canvasElement.ownerDocument.body)

      // A dialog that is *both* carrying the licence and painted. Stories
      // share a page, so a dialog left over from an earlier story is still in
      // the document while it animates out -- emptied, keeping its role. Ask
      // only "is there a dialog with this text" and the answer is that empty
      // box; ask only "is there a visible dialog" and it is somebody else's.
      await waitFor(async () => {
        const shown = screen
          .queryAllByText(/GNU General Public License/)
          .map((el) => el.closest('[role="dialog"]'))
          .filter(
            (el): el is HTMLElement =>
              el !== null && el.checkVisibility() && el.getBoundingClientRect().height > 0,
          )
        await expect(shown.length).toBeGreaterThan(0)
      })
    })
  },
}

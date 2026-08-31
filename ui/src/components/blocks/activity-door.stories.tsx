import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'

import { caseActivity } from '@/fixtures/caseChrome'

import { ActivityDoor } from './activity-door'

/**
 * The header's door onto what has been written to the case.
 *
 * The feed inside it is `ActivityFeed`; this owns the button, the mark and
 * when the panel is read. Entries arrive as a prop, so the gallery draws the
 * same door the app does.
 */
const meta = {
  title: 'Blocks/List/Activity door',
  component: ActivityDoor,
  parameters: { layout: 'centered' },
  args: { entries: caseActivity(Math.floor(Date.now() / 1000)) },
} satisfies Meta<typeof ActivityDoor>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing marked: the case has just been opened for the first time. */
export const Closed: Story = {
  name: 'Nothing new',
  play: async ({ canvas, canvasElement }) => {
    // Nothing marked, and the panel shut. A door that opened on arrival would
    // cover the case the analyst came to read.
    await expect(canvas.getByRole('button')).toBeVisible()
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('dialog'),
    ).toBeNull()
  },
}

/**
 * Writes have arrived since the analyst last looked.
 *
 * The mark is a dot rather than a count: how many is not a number anybody acts
 * on differently at two than at seven.
 */
export const Unseen: Story = {
  name: 'New since you last looked',
  args: { seen: 7 },
  play: async ({ canvas }) => {
    // A dot rather than a count: nobody acts differently at two than at
    // seven, and a number invites the arithmetic anyway.
    await expect(canvas.queryByText('7')).toBeNull()

    // The mark is on the door, so what it means has to travel in the name.
    const door = canvas.getByRole('button')
    await expect(door.getAttribute('aria-label')).toMatch(/new|unseen/i)
  },
}

/** The panel open, which is the only state the feed itself can be judged in. */
export const Open: Story = {
  name: 'The feed',
  parameters: { docs: { story: { inline: false, height: '420px' } } },
  args: { defaultOpen: true },
  play: async ({ canvasElement }) => {
    // The panel portals out of the door, and arrives a frame after the story.
    const screen = within(canvasElement.ownerDocument.body)
    await waitFor(() => {
      const live = screen.queryAllByRole('dialog').filter((el) => el.checkVisibility()).at(-1)
      if (live === undefined) throw new Error('the activity panel never opened')
    })

    // A case with entries does not draw the empty line. An open panel
    // listing nothing over a worked case is the failure this story exists
    // against, and it looks the same as a panel that simply has not loaded.
    await expect(screen.queryByText('Nothing has been written to this case yet.')).toBeNull()
  },
}

/** A case nothing has been written to yet. */
export const Empty: Story = {
  name: 'Nothing written yet',
  parameters: { docs: { story: { inline: false, height: '240px' } } },
  args: { entries: [], defaultOpen: true },
  play: async ({ canvasElement }) => {
    // An empty feed says so in a line. A panel that opened blank reads as one
    // that failed to load, which is a different thing from a case nobody has
    // written to yet.
    const screen = within(canvasElement.ownerDocument.body)
    await expect(
      await screen.findByText('Nothing has been written to this case yet.'),
    ).toBeVisible()
  },
}

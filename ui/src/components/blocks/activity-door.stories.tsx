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

/** The panel, once it is open. The overlay portals to `body`. */
async function panelOf(canvasElement: HTMLElement) {
  const screen = within(canvasElement.ownerDocument.body)
  await waitFor(() => {
    const live = screen.queryAllByRole('dialog').filter((el) => el.checkVisibility()).at(-1)
    if (live === undefined) throw new Error('the activity panel never opened')
  })
  return screen
}

const EMPTY_LINE = 'Nothing has been written to this case yet.'

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
    const screen = await panelOf(canvasElement)

    // A case with entries does not draw the empty line. An open panel
    // listing nothing over a worked case is the failure this story exists
    // against, and it looks the same as a panel that simply has not loaded.
    await expect(screen.queryByText(EMPTY_LINE)).toBeNull()
  },
}

/**
 * The read did not land.
 *
 * The empty line is a claim about the case, and a failed read is not evidence
 * for it - an analyst reading it during an incident concludes the case has no
 * history. -> #828
 */
export const Failed: Story = {
  name: 'The read failed',
  parameters: { docs: { story: { inline: false, height: '320px' } } },
  args: {
    entries: [],
    defaultOpen: true,
    problem: new Error('The activity could not be read.'),
    onRetry: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const screen = await panelOf(canvasElement)
    await expect(await screen.findByText('The activity could not be read.')).toBeVisible()
    await expect(screen.queryByText(EMPTY_LINE)).toBeNull()
    // The read is repeatable, so the analyst is offered it rather than being
    // left to reload the case.
    await expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  },
}

/**
 * The route is refused, which no amount of pressing changes.
 *
 * The demo has no store for the activity and answers 501; an install answers
 * 403 to an analyst who may not read it.
 */
export const Refused: Story = {
  name: 'The read was refused',
  parameters: { docs: { story: { inline: false, height: '320px' } } },
  args: {
    entries: [],
    defaultOpen: true,
    problem: Object.assign(new Error('Not available in the demo - this one runs on the server.'), {
      status: 501,
    }),
    onRetry: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const screen = await panelOf(canvasElement)
    await expect(
      await screen.findByText('Not available in the demo - this one runs on the server.'),
    ).toBeVisible()
    await expect(screen.queryByText(EMPTY_LINE)).toBeNull()
    // Offering to retry a refusal invites an analyst to keep pressing a
    // control that keeps failing.
    await expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  },
}

/**
 * The read is still out.
 *
 * **The skeleton is the boundary's own, and it does not have the feed's
 * shape.** `AsyncBoundary` takes a row count and nothing else, so the
 * placeholder is full-width bars where the feed is an indented marker beside
 * two short lines, and the panel moves when the answer lands. This story is
 * where that shift is visible; jsdom cannot see it, because every box there is
 * zero.
 */
export const Pending: Story = {
  name: 'Still reading',
  parameters: { docs: { story: { inline: false, height: '320px' } } },
  args: { entries: [], defaultOpen: true, busy: true },
  play: async ({ canvasElement }) => {
    const screen = await panelOf(canvasElement)
    await expect(screen.getByRole('status')).toBeVisible()
    await expect(screen.queryByText(EMPTY_LINE)).toBeNull()
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
      await screen.findByText(EMPTY_LINE),
    ).toBeVisible()
  },
}

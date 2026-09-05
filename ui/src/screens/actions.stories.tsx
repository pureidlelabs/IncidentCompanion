import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import type { ActionEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { ActionsScreen, type ActionWrites } from './actions'
import { EMPTY_CASE } from '@/components/blocks/entity-scope'
import { inACase } from '@/fixtures/in-a-case'

/**
 * The case's task list.
 *
 * The task column wraps and declares no width; every other column is a
 * percentage. Selecting rows draws the bulk bar at the far end of the toolbar.
 */
const meta = {
  title: 'Screens/Case/Actions',
  component: ActionsScreen,
  parameters: { layout: 'fullscreen' },
  /**
   * The scope an entity reference needs, and the router the link it becomes
   * needs after that. Without the provider this screen draws plain text where
   * the app draws a link with a hover card -- and a link and a span are
   * identical at rest here, so the difference is navigability rather than
   * anything a capture can show.
   */
  decorators: [inACase('actions')],
  args: {
    kase: campaignCase,
    specs: specsFixture,
  },
} satisfies Meta<typeof ActionsScreen>

export default meta
type Story = StoryObj<typeof meta>

const TASKS = campaignCase.actions

/**
 * Five tasks from the campaign demo.
 *
 * `open` carries no colour: the served tone map has `in progress` and
 * `completed` and nothing else, so the chip renders in the unmapped tone rather
 * than in an invented one.
 */
export const Populated: Story = {
  name: 'Five tasks',
}

/** Nothing to do yet. */
export const Empty: Story = {
  play: async ({ canvas, step }) => {
    await step('the words say what the list is for', async () => {
      await expect(canvas.getByText('No tasks yet')).toBeVisible()
      await expect(
        canvas.getByText('Containment, eradication and recovery work is tracked here.'),
      ).toBeVisible()
    })
  },
  name: 'No tasks',
  args: { kase: EMPTY_CASE },
}

/** A different empty, and different words. */
export const NoMatch: Story = {
  play: async ({ canvas, step }) => {
    await step('it does not say the case has no tasks', async () => {
      // Tasks exist; a narrowing hid them. The fix is a filter, not a task.
      await expect(canvas.queryByText('No tasks yet')).toBeNull()
    })
  },
  name: 'Filtered to nothing',
  args: { search: 'no task says this' },
}

/** A 420px pane. The task column wraps, so a narrow pane makes rows taller
 *  rather than hiding the half that says what to do. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <ActionsScreen {...args} />
    </div>
  ),
}

/**
 * A task longer than one line, and an assignee past its column.
 *
 * The task wraps and the assignee truncates, which is the split the two columns
 * are for.
 */
export const Overlong: Story = {
  name: 'A value too long for its column',
  args: {
    kase: {
      ...campaignCase,
      actions: campaignCase.actions.map((row, at) =>
        at === 0
          ? {
              ...row,
              task: 'Rebuild DC-01 from known-good media, reset krbtgt twice with a full replication cycle between the two resets, and confirm no Golden Ticket survives in the KDC cache',
              assignee: 'R. Okonkwo, infrastructure and identity recovery lead',
            }
          : row,
      ),
    },
  },
}

/**
 * Sixty tasks, twelve campaigns' worth: the pager, the sticky head and the
 * bulk-action bar all have to hold together under a task list this size.
 */
export const Dense: Story = {
  name: 'A task list with sixty tasks',
  args: { kase: manyTasks() },
  // The claim the name makes. A table that capped itself at the five the
  // fixture holds would render identically to the populated story.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = canvas.getAllByRole('row')
    await expect(rows.length).toBeGreaterThan(campaignCase.actions.length + 1)
  },
}

/** One task ticked: the bulk bar appears, named for exactly the one task. */
export const Selected: Story = {
  name: 'Selection: one ticked',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rowBoxes = canvas
      .getAllByRole('checkbox')
      .filter((box) => box.getAttribute('aria-label') !== 'Select every row')
    const first = rowBoxes[0]
    if (!first) throw new Error('the demo case has no task to tick')
    await userEvent.click(first)
    await expect(await canvas.findByText('1 selected')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Delete 1' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Edit 1' })).toBeVisible()
  },
}

/**
 * The add door pressed, and the task it wrote in the table.
 *
 * The gallery's screens carry no server, so what a save changes is this
 * screen's own copy of the list - which is where an analyst would look for it
 * either way. Written as a `play` because a dead add button looks identical to
 * a live one at rest, and that is how fourteen of them went unnoticed.
 */
export const Adding: Story = {
  name: 'Adding a task',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Add task' }))
    const dialog = within(await screen.findByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Task'), 'Revoke the service principal')
    await userEvent.click(dialog.getByRole('button', { name: 'Create' }))
    await expect(await canvas.findByText('Revoke the service principal')).toBeVisible()
  },
}

/** The pencil, which no screen in this tier used to draw at all. */
export const Editing: Story = {
  name: 'Editing a task',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pencils = await canvas.findAllByRole('button', { name: /^Edit / })
    await userEvent.click(pencils[0]!)
    await expect(await screen.findByRole('dialog', { name: 'Edit task' })).toBeInTheDocument()
  },
}

/** Twelve copies of the five campaign tasks, each with its own id. */
function manyTasks() {
  return {
    ...campaignCase,
    actions: Array.from({ length: 12 }, (_, copy) =>
      campaignCase.actions.map((row) => ({ ...row, id: `${row.id}-dense-${String(copy)}` })),
    ).flat(),
  }
}

/** A container that never answers, so a write stays in flight. */
function never(): ActionWrites {
  return {
    save: fn(() => new Promise<ActionEntry>(() => undefined)),
    patch: fn(() => new Promise<readonly ActionEntry[]>(() => undefined)),
    remove: fn(() => new Promise<void>(() => undefined)),
  }
}

/** A container that answers at once, with the rows it stored. */
function answering(): ActionWrites {
  return {
    save: fn((entry: ActionEntry | null, fields: Partial<ActionEntry>) =>
      Promise.resolve({ ...(entry ?? TASKS[0]!), ...fields, id: entry?.id ?? 'ac-stored' }),
    ),
    patch: fn((ids: readonly string[], fields: Partial<ActionEntry>) =>
      Promise.resolve(ids.map((id) => ({ ...TASKS[0]!, ...fields, id }))),
    ),
    remove: fn(() => Promise.resolve()),
  }
}

/** The task list's ids, in the order the fixture lists them. */
const IDS = TASKS.map((row) => row.id)

/**
 * The same screen with something serving it.
 *
 * Every story above this one is the gallery: no container, so a save changes
 * the screen's own copy and the task list answers itself. Below, the writes
 * leave and the list is updated from what comes back.
 *
 * **Each of these carries its own set of spies**, so what a story asserts is
 * what that story pressed. Sharing one set makes a call count the sum of
 * whichever stories ran first, and a count nobody can predict is a count
 * nobody can assert.
 *
 * Served and quiet: nothing in flight, so it reads exactly like the gallery.
 */
export const Served: Story = {
  name: 'Served by a container',
  args: { writes: answering() },
}

/**
 * A task added, with no answer yet.
 *
 * No row appears, and that is the design: the case does not hold the task
 * until the server says it does. A create says so by sending no row at all --
 * a container handed one would overwrite a task somebody already wrote.
 */
export const Saving: Story = {
  name: 'A save with no answer yet',
  args: { writes: never() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getAllByRole('row').length
    await userEvent.click(await canvas.findByRole('button', { name: 'Add task' }))
    const dialog = within(await screen.findByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Task'), 'Revoke the service principal')
    await userEvent.click(dialog.getByRole('button', { name: 'Create' }))
    await expect(canvas.getAllByRole('row')).toHaveLength(before)
    await expect(args.writes!.save).toHaveBeenCalledOnce()
    await expect(args.writes!.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ task: 'Revoke the service principal' }),
    )
  },
}

/**
 * A task edited and saved, with the row it belongs to named.
 *
 * The dialog is opened from a row's own pencil, so the task the container is
 * asked to change has to be that row and not the first one on the page.
 */
export const EditSaved: Story = {
  name: 'An edit sent to its container',
  args: { writes: answering() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const pencils = await canvas.findAllByRole('button', { name: /^Edit / })
    await userEvent.click(pencils[1]!)
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit task' }))
    const task = dialog.getByLabelText('Task')
    await userEvent.clear(task)
    await userEvent.type(task, 'Confirm what reached the sync host')
    await userEvent.click(dialog.getByRole('button', { name: /create|save/i }))
    await expect(args.writes!.save).toHaveBeenCalledOnce()
    await expect(args.writes!.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: IDS[1] }),
      expect.objectContaining({ task: 'Confirm what reached the sync host' }),
    )
  },
}

/**
 * One row's own delete, which this screen offers and the impact register does
 * not.
 *
 * The row's id and nothing else. A screen deleting by position rather than by
 * id empties the same line and reads correctly.
 */
export const RowDeleted: Story = {
  name: 'A row delete sent to its container',
  args: { writes: answering() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const bins = await canvas.findAllByRole('button', { name: /^Delete / })
    await userEvent.click(bins[1]!)
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /delete/i }))
    await expect(args.writes!.remove).toHaveBeenCalledOnce()
    await expect(args.writes!.remove).toHaveBeenCalledWith([IDS[1]])
  },
}

/**
 * Every row ticked and deleted at once, with the whole list named.
 *
 * The ids leave in the order the table holds them. A screen resolving the
 * selection by position rather than by id empties the same number of lines and
 * reads correctly on both counts.
 */
export const BulkDeleted: Story = {
  name: 'A bulk delete sent to its container',
  args: { writes: answering() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select every row' }))
    await userEvent.click(await canvas.findByRole('button', { name: /^Delete \d+$/ }))
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /delete/i }))
    await expect(args.writes!.remove).toHaveBeenCalledOnce()
    await expect(args.writes!.remove).toHaveBeenCalledWith(IDS)
  },
}

/**
 * One field set across a selection of two.
 *
 * Only the field that was changed travels: the rest of the form opens on
 * `(leave unchanged)` and a patch carrying them would set a task type on two
 * tasks nobody said anything about.
 */
export const BulkEdited: Story = {
  name: 'A bulk edit sent to its container',
  args: { writes: answering() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const rowBoxes = canvas
      .getAllByRole('checkbox')
      .filter((box) => box.getAttribute('aria-label') !== 'Select every row')
    await userEvent.click(rowBoxes[0]!)
    await userEvent.click(rowBoxes[1]!)
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit 2' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /Status/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'blocked' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await expect(args.writes!.patch).toHaveBeenCalledOnce()
    await expect(args.writes!.patch).toHaveBeenCalledWith([IDS[0], IDS[1]], { status: 'blocked' })
  },
}

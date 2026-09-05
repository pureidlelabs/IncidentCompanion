import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import type { MethodEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'
import { inACase } from '@/fixtures/in-a-case'

import { MethodsScreen, type MethodWrites } from './methods'

/**
 * How each finding in this case was obtained.
 *
 * A row is a note about an act that happened in a console somewhere else: the
 * query as it was run, the window it covered, and what came back. The app runs
 * nothing and checks nothing, so every value on this screen is what a person
 * recorded.
 */
const meta = {
  title: 'Screens/Collect/Methods',
  component: MethodsScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [inACase('methods')],
  args: { kase: campaignCase, specs: specsFixture },
} satisfies Meta<typeof MethodsScreen>

export default meta
type Story = StoryObj<typeof meta>

const METHODS = campaignCase.methods

/** The case with a different set of methods on it. */
const withMethods = (methods: MethodEntry[]) => ({ ...campaignCase, methods })

/** Three acts: two queries and one thing an analyst saw on a console. What
 *  each established leads the row, since that is what a reviewer scans an
 *  appendix for. */
export const Populated: Story = {
  name: 'Three recorded acts',
}

/** Nothing recorded yet: the words say what a row holds, before the form
 *  is even open. */
export const Empty: Story = {
  play: async ({ canvas, step }) => {
    await step('the words say what a row holds, before the form is open', async () => {
      // Nobody who has not written one knows what a method row is for, so the
      // empty state is where that is said rather than in the form.
      await expect(canvas.getByText('No methods recorded')).toBeVisible()
      await expect(
        canvas.getByText('How a finding was obtained: the query, where it ran, and what it returned.'),
      ).toBeVisible()
    })
  },
  name: 'No methods',
  args: { kase: withMethods([]) },
}

/** A different empty, and different words: nothing here invites a new row. */
export const NoMatch: Story = {
  play: async ({ canvas, step }) => {
    await step('nothing here invites a new row', async () => {
      // Acts are recorded; a narrowing hid them. Inviting another would have
      // an analyst record what they have already recorded.
      await expect(canvas.queryByText('No methods recorded')).toBeNull()
    })
  },
  name: 'Filtered to nothing',
  args: { search: 'no method says this' },
}

/** A claim, a name and a console past the width of their columns: what it
 *  established wraps, since truncation would hide what the act proved. */
export const Overlong: Story = {
  name: 'Values too long for their columns',
  args: {
    kase: withMethods(
      METHODS.map((row, at) =>
        at === 0
          ? {
              ...row,
              // The widest value `METHOD_KIND` serves. A story about values too
              // long for their columns that left the one column drawing a
              // badge at its fixture value is why nothing saw the badge
              // leave the cell.
              kind: 'forensic acquisition',
              name: 'Sentinel proxy sweep, second pass with the sync host list widened',
              established:
                'Exfiltration of three archives to an external sync host, over two hours, from a workstation that had no business reaching it and from an account whose owner was on leave',
              console: 'Microsoft Sentinel (meridian-prod-law, secondary workspace)',
            }
          : row,
      ),
    ),
  },
}

/** Forty acts, which is what a long investigation leaves behind: the count
 *  beside the title says the table is scrolling. */
export const Dense: Story = {
  name: 'A long investigation',
  args: {
    kase: withMethods(
      Array.from({ length: 40 }, (_unused, at) => {
        const base = METHODS[at % METHODS.length]!
        const stated = at % 3 === 0
        return {
          ...base,
          id: `m-dense-${String(at)}`,
          name: `${base.name} ${String(at + 1)}`,
          console: at % 4 === 0 ? 'CrowdStrike Falcon' : base.console,
          rowsReturned: at % 5 === 0 ? 0 : at * 3,
          windowFrom: stated ? '2026-08-13T08:00:00.000Z' : null,
          windowTo: stated ? '2026-08-13T20:00:00.000Z' : null,
        }
      }),
    ),
  },
}

/** A 420px pane: the table scrolls sideways inside its wrapper. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <MethodsScreen {...args} />
    </div>
  ),
}

/** A row opened, with the query underneath it: it keeps its line breaks and
 *  its gutter, and a long line scrolls sideways rather than wrapping. */
export const Expanded: Story = {
  name: 'A method opened',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chevrons = await canvas.findAllByRole('button', { name: 'Show detail' })
    await userEvent.click(chevrons[0]!)
    await expect(await canvas.findByText(/CommonSecurityLog/)).toBeInTheDocument()
  },
}

/** The add door, and the form it opens. */
export const Adding: Story = {
  name: 'Adding a method',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Add method' }))
    await expect(await screen.findByRole('dialog', { name: 'Add method' })).toBeInTheDocument()
  },
}

/** The pencil on the first row. */
export const Editing: Story = {
  name: 'Editing a method',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pencils = await canvas.findAllByRole('button', { name: /^Edit / })
    await userEvent.click(pencils[0]!)
    await expect(await screen.findByRole('dialog', { name: 'Edit method' })).toBeInTheDocument()
  },
}

/** Deleting, with the selection made first: the dialog names how many rows
 *  are going. */
export const Deleting: Story = {
  name: 'Deleting a selection',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select every row' }))
    // The bulk bar's control carries the count -- `Delete 3` -- where a row's
    // own carries the row. Ticking every row puts both on screen, so a bare
    // `/^Delete/` matches several and the query throws rather than failing.
    await userEvent.click(await canvas.findByRole('button', { name: /^Delete \d+$/ }))
    await expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  },
}

/** The read still in flight: the table's place is held while the
 *  collection loads. */
export const Loading: Story = {
  name: 'Still loading',
  args: { busy: true },
}

/** A read that failed, with the way to try it again. */
export const ReadFailed: Story = {
  name: 'The read failed',
  args: {
    problem: new Error('The case could not be read.'),
    onRetry: () => undefined,
  },
}

// Below: served by a container, and each container below records what the
// screen asked it for -- a table with the wrong rows sent is
// indistinguishable from one with the right ones, so the recorded call is
// where the difference lives.
/** A container that never answers, so a write stays in flight. */
const NEVER: MethodWrites = {
  save: fn(() => new Promise<MethodEntry>(() => undefined)),
  patch: fn(() => new Promise<readonly MethodEntry[]>(() => undefined)),
  remove: fn(() => new Promise<void>(() => undefined)),
}

/** A container that answers at once, with the rows it stored. */
const ANSWERS: MethodWrites = {
  save: fn((entry: MethodEntry | null, fields: Partial<MethodEntry>) =>
    Promise.resolve({ ...(entry ?? METHODS[0]!), ...fields, id: 'm-stored' }),
  ),
  patch: fn((ids: readonly string[], fields: Partial<MethodEntry>) =>
    Promise.resolve(ids.map((id) => ({ ...METHODS[0]!, ...fields, id }))),
  ),
  remove: fn(() => Promise.resolve()),
}

/** The collection's ids, in the order the fixture lists them. */
const IDS = METHODS.map((row) => row.id)

/** Served and quiet: nothing in flight, so it reads exactly like the gallery. */
export const Served: Story = {
  name: 'Served by a container',
  args: { writes: ANSWERS },
}

/**
 * A row mid-write, held there by a container that never answers.
 *
 * The whole treatment is opacity, so this is the only place the state can be
 * judged at all. It also shows the gap: the row is dimmed and announced
 * nowhere, so a screen reader reaches an ordinary one.
 */
export const Writing: Story = {
  name: 'A row being written',
  args: { writes: NEVER },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click((await canvas.findAllByRole('button', { name: /^Delete / }))[0]!)
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /delete/i }))
    // The first row's own id, not its position. Both dim the same row.
    await expect(args.writes!.remove).toHaveBeenCalledWith([IDS[0]])
  },
}

/** A method edited and saved, with the row it belongs to named -- opened
 *  from that row's own pencil, not the first on the page. */
export const EditSaved: Story = {
  name: 'An edit sent to its container',
  args: { writes: ANSWERS },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const pencils = await canvas.findAllByRole('button', { name: /^Edit / })
    await userEvent.click(pencils[1]!)
    const dialog = await screen.findByRole('dialog', { name: 'Edit method' })
    const name = within(dialog).getByLabelText(/^Name/)
    await userEvent.clear(name)
    await userEvent.type(name, 'proxy sweep, widened host list')
    await userEvent.click(within(dialog).getByRole('button', { name: /create|save/i }))
    await expect(args.writes!.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: IDS[1] }),
      expect.objectContaining({ name: 'proxy sweep, widened host list' }),
    )
  },
}

/** Every row ticked and deleted at once, with the whole collection named:
 *  the bar counts the selection and the confirmation counts it again. */
export const BulkDeleted: Story = {
  name: 'A bulk delete sent to its container',
  args: { writes: ANSWERS },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select every row' }))
    await userEvent.click(await canvas.findByRole('button', { name: /^Delete \d+$/ }))
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /delete/i }))
    await expect(args.writes!.remove).toHaveBeenCalledWith(IDS)
  },
}

/** One field set across a selection of two: the other field opens on
 *  `(leave unchanged)`, so only the changed one travels. */
export const BulkEdited: Story = {
  name: 'A bulk edit sent to its container',
  args: { writes: ANSWERS },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const rowBoxes = canvas
      .getAllByRole('checkbox')
      .filter((box) => box.getAttribute('aria-label') !== 'Select every row')
    await userEvent.click(rowBoxes[0]!)
    await userEvent.click(rowBoxes[1]!)
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit 2' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /Kind/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'interview' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await expect(args.writes!.patch).toHaveBeenCalledWith([IDS[0], IDS[1]], { kind: 'interview' })
  },
}

/**
 * A save the container has not answered.
 *
 * No row appears: the case does not hold the method until the server says
 * so. Nothing tells the analyst the save is still in flight, since the busy
 * treatment lands on rows and this one has none yet.
 */
export const Saving: Story = {
  name: 'A save with no answer yet',
  args: { writes: NEVER },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getAllByRole('row').length
    await userEvent.click(await canvas.findByRole('button', { name: 'Add method' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add method' })
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'mailbox rule audit')
    await userEvent.click(within(dialog).getByRole('button', { name: /create|save/i }))
    await expect(canvas.getAllByRole('row')).toHaveLength(before)
    // A create says so by sending no row at all. A container handed one
    // would overwrite an act somebody already recorded.
    await expect(args.writes!.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ name: 'mailbox rule audit' }),
    )
  },
}

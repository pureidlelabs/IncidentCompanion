import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import type { ImpactEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { ImpactScreen, type ImpactWrites } from './impact'
import { EMPTY_CAMPAIGN } from './timeline-entries'
import { inACase } from '@/fixtures/in-a-case'

/**
 * What the incident reached.
 *
 * The row is the data, not the host: the regulations ask what was taken,
 * altered or destroyed, and the host is a column on that answer.
 */
const meta = {
  title: 'Screens/Collect/Impact',
  component: ImpactScreen,
  parameters: { layout: 'fullscreen' },
  /**
   * The scope an entity reference needs, and the router the link it becomes
   * needs after that. Without the provider this screen draws plain text where
   * the app draws a link with a hover card -- and a link and a span are
   * identical at rest here, so the difference is navigability rather than
   * anything a capture can show.
   */
  decorators: [inACase('impact')],
  args: {
    kase: campaignCase,
    specs: specsFixture,
  },
} satisfies Meta<typeof ImpactScreen>

export default meta
type Story = StoryObj<typeof meta>

const RECORDS = campaignCase.impact

/**
 * Four records, none of them counted.
 *
 * `subjectCount` and `recordCount` are `null` on every one, so neither has a
 * column - four columns of dashes said nothing the empty cells did not.
 */
export const Populated: Story = {
  name: 'Four records, uncounted',
}

/**
 * One record counted, which brings the Subjects and Records columns back.
 *
 * A zero is an answer: "no data subjects" and "nobody has said" are different
 * facts, and the column has to appear for the first.
 */
export const Counted: Story = {
  name: 'One record counted',
  args: { kase: counted() },
  // The claim the story is named for. A `!value` test counts a stored zero as
  // an absence, and the column then never appears for the record that has one.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Subjects')).toBeVisible()
    await expect(await canvas.findByText('Records')).toBeVisible()
  },
}

/** Nothing recorded. The words say what belongs here rather than what is missing. */
export const Empty: Story = {
  play: async ({ canvas, step }) => {
    await step('the words say what belongs here, not what is missing', async () => {
      await expect(canvas.getByText('No data impact recorded yet')).toBeVisible()
      await expect(canvas.getByText(/taken, encrypted, altered or destroyed/)).toBeVisible()
    })
  },
  name: 'No impact recorded',
  args: { kase: EMPTY_CAMPAIGN },
}

/** A different empty, and different words: the fix is a filter, not a record. */
export const NoMatch: Story = {
  play: async ({ canvas, step }) => {
    await step('the fix is a filter rather than a record', async () => {
      await expect(canvas.queryByText('No data impact recorded yet')).toBeNull()
    })
  },
  name: 'Filtered to nothing',
  args: { search: 'no record says this' },
}

/** A 420px pane: the table scrolls sideways inside its wrapper. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <ImpactScreen {...args} />
    </div>
  ),
}

/** A data label past its column, with the note that explains it in the fold. */
export const Overlong: Story = {
  name: 'A value too long for its column',
  args: {
    kase: {
      ...campaignCase,
      impact: campaignCase.impact.map((row, at) =>
        at === 0
          ? {
              ...row,
              label:
                'Finance share archive, including the consolidated payroll extract and the 2024-2026 supplier master table (finance-share-archive.7z)',
            }
          : row,
      ),
    },
  },
}

/**
 * Sixty records, fifteen campaigns' worth: the pager and the sticky head have
 * to hold together under an impact register this size.
 */
export const Dense: Story = {
  name: 'A register with sixty records',
  args: { kase: manyRecords() },
  // The claim the name makes. A table that capped itself at the four the
  // fixture holds would render identically to the populated story.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = canvas.getAllByRole('row')
    await expect(rows.length).toBeGreaterThan(campaignCase.impact.length + 1)
  },
}

/** The add door pressed, and the record it wrote in the register. */
export const Adding: Story = {
  name: 'Adding a record',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Add record' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add record' }))
    await userEvent.type(dialog.getByLabelText(/what data/i), 'Backup archive, unencrypted')
    await userEvent.click(dialog.getByRole('button', { name: /create|save/i }))
    await expect(await canvas.findByText('Backup archive, unencrypted')).toBeVisible()
  },
}

/** The pencil, on a register whose rows had none. */
export const Editing: Story = {
  name: 'Editing a record',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pencils = await canvas.findAllByRole('button', { name: /^Edit / })
    await userEvent.click(pencils[0]!)
    await expect(await screen.findByRole('dialog', { name: 'Edit record' })).toBeInTheDocument()
  },
}

/** No row ticked: every checkbox is clear and the bulk bar draws nothing. */
export const NothingSelected: Story = {
  name: 'Selection: nothing ticked',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('checkbox', { name: 'Select every row' })).not.toBeChecked()
    await expect(canvas.queryByText(/\d+ selected/)).toBeNull()
  },
}

/**
 * One row ticked: the bar appears, named for exactly the one row, with a bulk
 * edit offered -- `category` and `disposition` are both closed vocabularies.
 */
export const SomeSelected: Story = {
  name: 'Selection: one ticked',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rowBoxes = canvas
      .getAllByRole('checkbox')
      .filter((box) => box.getAttribute('aria-label') !== 'Select every row')
    const first = rowBoxes[0]
    if (!first) throw new Error('the register has no row to tick')
    await userEvent.click(first)
    await expect(await canvas.findByText('1 selected')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Delete 1' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Edit 1' })).toBeVisible()
  },
}

/** Every row ticked through the header box, and the bar names the whole register. */
export const AllSelected: Story = {
  name: 'Selection: every row ticked',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const total = campaignCase.impact.length
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select every row' }))
    await expect(await canvas.findByText(`${String(total)} selected`)).toBeVisible()
    await expect(canvas.getByRole('button', { name: `Delete ${String(total)}` })).toBeVisible()
  },
}

/**
 * Deleting, with the selection made first.
 *
 * The dialog names how many records are going.
 */
export const Deleting: Story = {
  name: 'Deleting a selection',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select every row' }))
    // The bulk bar's control carries the count -- `Delete 4` -- where a row's
    // own would carry the record. This screen offers no per-row delete, so a
    // bare `/^Delete/` is unambiguous here, but the exact match keeps the two
    // screens' stories identical in shape.
    await userEvent.click(await canvas.findByRole('button', { name: /^Delete \d+$/ }))
    await expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  },
}

/** Fifteen copies of the four campaign records, each with its own id. */
function manyRecords() {
  return {
    ...campaignCase,
    impact: Array.from({ length: 15 }, (_, copy) =>
      campaignCase.impact.map((row) => ({ ...row, id: `${row.id}-dense-${String(copy)}` })),
    ).flat(),
  }
}

/** The first record with a subject count of zero and a record count that is not. */
function counted() {
  return {
    ...campaignCase,
    impact: campaignCase.impact.map((row, at) =>
      at === 0 ? { ...row, subjectCount: 0, recordCount: 184_320 } : row,
    ),
  }
}

/** A container that never answers, so a write stays in flight. */
function never(): ImpactWrites {
  return {
    save: fn(() => new Promise<ImpactEntry>(() => undefined)),
    patch: fn(() => new Promise<readonly ImpactEntry[]>(() => undefined)),
    remove: fn(() => new Promise<void>(() => undefined)),
  }
}

/** A container that answers at once, with the rows it stored. */
function answering(): ImpactWrites {
  return {
    save: fn((entry: ImpactEntry | null, fields: Partial<ImpactEntry>) =>
      Promise.resolve({ ...(entry ?? RECORDS[0]!), ...fields, id: entry?.id ?? 'im-stored' }),
    ),
    patch: fn((ids: readonly string[], fields: Partial<ImpactEntry>) =>
      Promise.resolve(ids.map((id) => ({ ...RECORDS[0]!, ...fields, id }))),
    ),
    remove: fn(() => Promise.resolve()),
  }
}

/** The register's ids, in the order the fixture lists them. */
const IDS = RECORDS.map((row) => row.id)

/**
 * The same screen with something serving it.
 *
 * Every story above this one is the gallery: no container, so a save changes
 * the screen's own copy and the register answers itself. Below, the writes
 * leave and the register is updated from what comes back.
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
 * A record added, with no answer yet.
 *
 * No row appears, and that is the design: the case does not hold the record
 * until the server says it does. A create says so by sending no row at all --
 * a container handed one would overwrite a record somebody already made.
 */
export const Saving: Story = {
  name: 'A save with no answer yet',
  args: { writes: never() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getAllByRole('row').length
    await userEvent.click(await canvas.findByRole('button', { name: 'Add record' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add record' }))
    await userEvent.type(dialog.getByLabelText(/what data/i), 'Backup archive, unencrypted')
    await userEvent.click(dialog.getByRole('button', { name: /create|save/i }))
    await expect(canvas.getAllByRole('row')).toHaveLength(before)
    await expect(args.writes!.save).toHaveBeenCalledOnce()
    await expect(args.writes!.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ label: 'Backup archive, unencrypted' }),
    )
  },
}

/**
 * A record edited and saved, with the row it belongs to named.
 *
 * The dialog is opened from a row's own pencil, so the record the container is
 * asked to change has to be that row and not the first one on the page.
 */
export const EditSaved: Story = {
  name: 'An edit sent to its container',
  args: { writes: answering() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const pencils = await canvas.findAllByRole('button', { name: /^Edit / })
    await userEvent.click(pencils[1]!)
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit record' }))
    const data = dialog.getByLabelText(/what data/i)
    await userEvent.clear(data)
    await userEvent.type(data, 'HR records, second archive')
    await userEvent.click(dialog.getByRole('button', { name: /create|save/i }))
    await expect(args.writes!.save).toHaveBeenCalledOnce()
    await expect(args.writes!.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: IDS[1] }),
      expect.objectContaining({ label: 'HR records, second archive' }),
    )
  },
}

/**
 * Every row ticked and deleted at once, with the whole register named.
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
 * `(leave unchanged)` and a patch carrying them would set a category on two
 * records nobody said anything about.
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
    await userEvent.click(within(dialog).getByRole('button', { name: /What happened to it/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'destroyed' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await expect(args.writes!.patch).toHaveBeenCalledOnce()
    await expect(args.writes!.patch).toHaveBeenCalledWith([IDS[0], IDS[1]], {
      disposition: 'destroyed',
    })
  },
}

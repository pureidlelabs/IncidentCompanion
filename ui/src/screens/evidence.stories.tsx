import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import type { EvidenceEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { inACase } from '@/fixtures/in-a-case'
import { EvidenceScreen, type EvidenceWrites } from './evidence'
import { EMPTY_CASE } from '@/components/blocks/entity-scope'

/**
 * The evidence register.
 */
const meta = {
  title: 'Screens/Collect/Evidence',
  component: EvidenceScreen,
  parameters: { layout: 'fullscreen' },
  /**
   * The page, not the section.
   */
  decorators: [inACase('evidence')],
  args: {
    kase: campaignCase,
    specs: specsFixture,
  },
} satisfies Meta<typeof EvidenceScreen>

export default meta
type Story = StoryObj<typeof meta>

/** Four records, all promised. `hash` has no column here -- nothing in
 *  this case fills it, and it returns the moment one record disagrees. */
export const Populated: Story = {
  play: async ({ canvas, step }) => {
    await step('a column nothing in this case fills is not drawn', async () => {
      // The other half of `Collected`: asserting only that a filled column
      // appears would pass just as well if every column always appeared.
      await expect(canvas.queryByRole('columnheader', { name: /Hash/i })).toBeNull()
    })
  },
  name: 'Four promised records',
}

/** One record collected, which brings the Hash column back. */
export const Collected: Story = {
  play: async ({ canvas, step }) => {
    await step('collecting a record brings its column back', async () => {
      // Which columns exist is decided by what this case fills rather than by
      // the schema, so a digest nobody has recorded draws no Hash column.
      await expect(canvas.getByRole('columnheader', { name: /Hash/i })).toBeInTheDocument()
    })
  },
  name: 'One record collected',
  args: {
    kase: {
      ...campaignCase,
      evidence: campaignCase.evidence.map((row, at) =>
        at === 0
          ? {
              ...row,
              storedAt: '2026-08-14T09:12:00.000Z',
              hash: '9f2c4b7e18a0d3f65c8b1e4a7d09f23b6e5c8a1d4f7b0e3c6a9d2f5b8e1c4a70',
            }
          : row,
      ),
    },
  },
}

/** Nothing recorded yet. The words say a record can precede its file. */
export const Empty: Story = {
  play: async ({ canvas, step }) => {
    await step('the words say a record can precede its file', async () => {
      // Evidence is promised before it is collected, so an empty register is
      // an invitation rather than a report of nothing.
      await expect(canvas.getByText('No evidence recorded')).toBeVisible()
      await expect(canvas.getByText(/reads as promised until the bytes arrive/)).toBeVisible()
    })
  },
  name: 'No records',
  args: { kase: EMPTY_CASE },
}

/** A different empty, and different words. */
export const NoMatch: Story = {
  play: async ({ canvas, step }) => {
    await step('it does not say the register is empty', async () => {
      // Records exist; a narrowing hid them. Saying otherwise sends somebody
      // to record evidence that is already there.
      await expect(canvas.queryByText('No evidence recorded')).toBeNull()
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
      <EvidenceScreen {...args} />
    </div>
  ),
}

/** A vault path and a name past their columns: the Name column takes
 *  whatever width the optional columns leave, so it truncates rather than
 *  pushing the grid sideways. */
export const Overlong: Story = {
  name: 'A value too long for its column',
  args: {
    kase: {
      ...campaignCase,
      evidence: campaignCase.evidence.map((row, at) =>
        at === 0
          ? {
              ...row,
              name: 'WKS-FIN01 KAPE triage collection, full targets plus memory capture, second pass',
              location:
                'evidence-vault://meridian/2026-031/wks-fin01/kape-full-targets-and-memory.zip',
            }
          : row,
      ),
    },
  },
}

/** The add door pressed, and the record it wrote in the register. */
export const Adding: Story = {
  name: 'Adding a record',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Add record' }))
    await expect(await screen.findByRole('dialog', { name: 'Add record' })).toBeInTheDocument()
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

/** One row ticked: the bar appears, named for exactly the one row, with a bulk edit offered for `type`. */
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
    const total = campaignCase.evidence.length
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select every row' }))
    await expect(await canvas.findByText(`${String(total)} selected`)).toBeVisible()
    await expect(canvas.getByRole('button', { name: `Delete ${String(total)}` })).toBeVisible()
  },
}

/** Sixty records, ten campaigns' worth: the pager, the sticky head and the
 *  bulk toolbar have to hold together at this size. */
export const Dense: Story = {
  name: 'A register with sixty records',
  args: { kase: manyRecords() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = canvas.getAllByRole('row')
    await expect(rows.length).toBeGreaterThan(campaignCase.evidence.length + 1)
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

// Below: served by a container. `writes` is supplied and the local copy is
// left alone, so pressing Save adds no row on its own. Each container below
// records what the screen asked it for -- a story that only reads the table
// back cannot tell a call that sent the right ids from one that sent the
// wrong row, since both leave the same row count.
/** A container that never answers, so a write stays in flight. */
const NEVER: EvidenceWrites = {
  save: fn(() => new Promise<EvidenceEntry>(() => undefined)),
  patch: fn(() => new Promise<readonly EvidenceEntry[]>(() => undefined)),
  remove: fn(() => new Promise<void>(() => undefined)),
}

/** A container that answers at once, with the row it stored. */
const ANSWERS: EvidenceWrites = {
  save: fn((entry: EvidenceEntry | null, fields: Partial<EvidenceEntry>) =>
    Promise.resolve({ ...(entry ?? campaignCase.evidence[0]!), ...fields, id: 'ev-stored' }),
  ),
  patch: fn((ids: readonly string[], fields: Partial<EvidenceEntry>) =>
    Promise.resolve(ids.map((id) => ({ ...campaignCase.evidence[0]!, ...fields, id }))),
  ),
  remove: fn(() => Promise.resolve()),
}

/** The register's ids, in the order the fixture lists them. */
const IDS = campaignCase.evidence.map((row) => row.id)

/** Served and quiet: nothing in flight, so it reads exactly like the gallery. */
export const Served: Story = {
  name: 'Served by a container',
  args: { writes: ANSWERS },
}

/**
 * A row mid-write, held there by a container that never answers.
 */
export const Writing: Story = {
  name: 'A row being written',
  args: { writes: NEVER },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click((await canvas.findAllByRole('button', { name: /^Delete / }))[0]!)
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /delete/i }))
    // The first row's own id and nothing else. A screen deleting by position
    // rather than by id dims the same row and empties the same line.
    await expect(args.writes!.remove).toHaveBeenCalledWith([IDS[0]])
  },
}

/** Fifteen copies of the four campaign records, each with its own id. */
function manyRecords() {
  return {
    ...campaignCase,
    evidence: Array.from({ length: 15 }, (_, copy) =>
      campaignCase.evidence.map((row) => ({ ...row, id: `${row.id}-dense-${String(copy)}` })),
    ).flat(),
  }
}

/**
 * A save the container has not answered.
 */
export const Saving: Story = {
  name: 'A save with no answer yet',
  args: { writes: NEVER },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getAllByRole('row').length
    await userEvent.click(await canvas.findByRole('button', { name: 'Add record' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add record' })
    await userEvent.type(within(dialog).getByLabelText(/name/i), 'mailbox audit export')
    await userEvent.click(within(dialog).getByRole('button', { name: /create|save/i }))
    await expect(canvas.getAllByRole('row')).toHaveLength(before)
    // A create says so by sending no entry, and it carries the name that was
    // typed rather than whichever record the register was showing.
    await expect(args.writes!.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ name: 'mailbox audit export' }),
      null,
    )
  },
}

/** A record edited and saved, with the row it belongs to named -- opened
 *  from that row's own pencil, not the first one on the page. */
export const EditSaved: Story = {
  name: 'An edit sent to its container',
  args: { writes: ANSWERS },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const pencils = await canvas.findAllByRole('button', { name: /^Edit / })
    await userEvent.click(pencils[1]!)
    const dialog = await screen.findByRole('dialog', { name: 'Edit record' })
    const name = within(dialog).getByLabelText(/name/i)
    await userEvent.clear(name)
    await userEvent.type(name, 'proxy log export, second pull')
    await userEvent.click(within(dialog).getByRole('button', { name: /create|save/i }))
    await expect(args.writes!.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: IDS[1] }),
      expect.objectContaining({ name: 'proxy log export, second pull' }),
      null,
    )
  },
}

/** A record added with its file attached: the bytes travel beside the
 *  fields, not inside them. */
export const SavedWithFile: Story = {
  name: 'A save carrying its file',
  args: { writes: ANSWERS },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Add record' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add record' })
    const slot = dialog.querySelector<HTMLInputElement>('input[type="file"]')
    if (!slot) throw new Error('the dialog offers no file input')
    const bytes = new File(['MZ'], 'wks-fin01-triage.zip', { type: 'application/zip' })
    await userEvent.upload(slot, bytes)
    await userEvent.type(within(dialog).getByLabelText(/name/i), 'WKS-FIN01 triage')
    await userEvent.click(within(dialog).getByRole('button', { name: /create|save/i }))
    await expect(args.writes!.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ name: 'WKS-FIN01 triage' }),
      bytes,
    )
  },
}

/** Every row ticked and deleted at once, with the whole register named: the
 *  bar counts the selection and the confirmation counts it again. */
export const BulkDeleted: Story = {
  name: 'A bulk delete sent to its container',
  args: { writes: ANSWERS },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select every row' }))
    await userEvent.click(await canvas.findByRole('button', { name: /^Delete \d+$/ }))
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /delete/i }))
    await expect(args.writes!.remove).toHaveBeenCalledWith(IDS)
  },
}

/** One field set across a selection of two: the rest of the form opens on
 *  `(leave unchanged)`, so only the changed field travels. */
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
    await userEvent.click(within(dialog).getByRole('button', { name: /Type/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'disk image' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await expect(args.writes!.patch).toHaveBeenCalledWith([IDS[0], IDS[1]], { type: 'disk image' })
  },
}

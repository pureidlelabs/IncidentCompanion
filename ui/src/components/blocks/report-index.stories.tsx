import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { ApiError } from '@/api/client'
import { DEMO_STAGES } from '@/components/blocks/report-layouts'
import { DEMO_BLOCKS, DEMO_REPORTS, blocksOf } from '@/components/blocks/report-shape'

import { ReportIndexPane } from './report-index'

/**
 * The report section's landing view: four reports, and what each still owes.
 *
 * The line above the table names the reports with empty sections rather than
 * counting them - a count is a number you then have to resolve against the
 * table yourself.
 */
const meta = {
  title: 'Blocks/Report/Index',
  component: ReportIndexPane,
  parameters: { layout: 'padded' },
  // All four doors, since drawing without them is the read-only state and
  // not the ordinary one. The container wires them; here they record what
  // they were handed, because every report on this table is deleted, copied
  // and opened by exactly the same controls and only the id tells them apart.
  args: {
    reports: DEMO_REPORTS,
    blocks: DEMO_BLOCKS,
    onOpen: fn(),
    onNew: fn(),
    onDelete: fn(),
    onDuplicate: fn(),
  },
} satisfies Meta<typeof ReportIndexPane>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The campaign demo's four reports: a customer RCA and the three Article 23
 * stages.
 *
 * Two written sections hold text and the rest are generated, so the outstanding
 * line names the reports where somebody still has to write.
 */
export const Populated: Story = { name: 'Four reports, two part-written' }

/** Delete pressed on the first row, asking before it acts. */
export const DeleteConfirming: Story = {
  name: 'Delete asked, not yet answered',
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const first = DEMO_REPORTS[0]
    if (!first) throw new Error('fixture needs at least one report')
    const label = first.label || 'Untitled report'
    await userEvent.click(await canvas.findByRole('button', { name: `Delete ${label}` }))
    await expect(screen.findByRole('alertdialog')).resolves.toBeInTheDocument()
    // Asked, and nothing more. A table that deleted first and then drew the
    // question renders exactly this.
    await expect(args.onDelete).not.toHaveBeenCalled()
  },
}

/**
 * Delete answered, and the report that goes is the row it was pressed on.
 *
 * Every row's bin is the same control with a different name on it, so the id
 * is the whole of what distinguishes them.
 */
export const Deleted: Story = {
  name: 'Delete answered',
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const second = DEMO_REPORTS[1]
    if (!second) throw new Error('fixture needs at least two reports')
    const label = second.label || 'Untitled report'
    await userEvent.click(await canvas.findByRole('button', { name: `Delete ${label}` }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /delete/i }))
    await expect(args.onDelete).toHaveBeenCalledOnce()
    await expect(args.onDelete).toHaveBeenCalledWith(second.id)
  },
}

/**
 * The new-report door, which is the one control here that names no report.
 *
 * It sits beside a table of titles that all open something, so what it must
 * not do is open one.
 */
export const NewAsked: Story = {
  name: 'A new report asked for',
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /new report/i }))
    await expect(args.onNew).toHaveBeenCalledOnce()
    await expect(args.onOpen).not.toHaveBeenCalled()
  },
}

/** A report opened from the table, which is the only thing its title does. */
export const Opened: Story = {
  name: 'A report opened',
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const second = DEMO_REPORTS[1]
    if (!second) throw new Error('fixture needs at least two reports')
    await userEvent.click(await canvas.findByRole('button', { name: second.label }))
    await expect(args.onOpen).toHaveBeenCalledOnce()
    await expect(args.onOpen).toHaveBeenCalledWith(second.id)
  },
}

/**
 * The server refuses the delete - another table still names the report - and
 * the dialog stays open with its reason in place of the usual consequence.
 */
export const DeleteRefused: Story = {
  name: 'Delete refused',
  args: {
    onDelete: fn(() =>
      Promise.reject(new ApiError(409, 'This report is referenced elsewhere.', {})),
    ),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const first = DEMO_REPORTS[0]
    if (!first) throw new Error('fixture needs at least one report')
    const label = first.label || 'Untitled report'
    await userEvent.click(await canvas.findByRole('button', { name: `Delete ${label}` }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /delete/i }))
    await expect(
      within(dialog).findByText('This report is referenced elsewhere.'),
    ).resolves.toBeInTheDocument()
    // The refusal belongs to the row that was asked for, and a retry must not
    // ask again on its own.
    await expect(args.onDelete).toHaveBeenCalledOnce()
    await expect(args.onDelete).toHaveBeenCalledWith(first.id)
  },
}

/**
 * A copy asked for and not yet answered - the row's own title is the only
 * signal, since duplicating has no dialog of its own.
 */
export const Duplicating: Story = {
  name: 'A copy in flight',
  // Never settles, so the play function's own state is what the story holds.
  args: { onDuplicate: fn(() => new Promise(() => undefined)) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const first = DEMO_REPORTS[0]
    if (!first) throw new Error('fixture needs at least one report')
    const label = first.label || 'Untitled report'
    await userEvent.click(await canvas.findByRole('button', { name: `More for ${label}` }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /duplicate/i }))
    await waitFor(async () => {
      const door = await canvas.findByRole('button', { name: label })
      await expect(door.className).toMatch(/opacity-60/)
    })
    // The dimmed row and the copied report have to be the same one: a menu
    // that dimmed by position would look identical here.
    await expect(args.onDuplicate).toHaveBeenCalledOnce()
    await expect(args.onDuplicate).toHaveBeenCalledWith(first.id)
  },
}

/**
 * A copy the case would not take.
 *
 * The band names the report and carries the server's own reason. It sits above
 * the table because the stage chips can filter the named row out, and because
 * a copy is refused by the case rather than by anything the row holds.
 */
export const DuplicateRefused: Story = {
  name: 'A refused copy',
  args: {
    onDuplicate: fn(() =>
      Promise.reject(
        new ApiError(409, 'This case is frozen; nothing new can be written to it.', {}),
      ),
    ),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const first = DEMO_REPORTS[0]
    if (!first) throw new Error('fixture needs at least one report')
    const label = first.label || 'Untitled report'
    await userEvent.click(await canvas.findByRole('button', { name: `More for ${label}` }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /duplicate/i }))
    // The reason, not just a band: a refusal drawn without the server's words
    // renders identically and tells the analyst nothing.
    await expect(
      canvas.findByText('This case is frozen; nothing new can be written to it.'),
    ).resolves.toBeInTheDocument()
    await expect(canvas.findByText(`${label} was not copied`)).resolves.toBeInTheDocument()
    // The band names a report; this is what says it is the one that was asked
    // for rather than whichever row the band happens to describe.
    await expect(args.onDuplicate).toHaveBeenCalledOnce()
    await expect(args.onDuplicate).toHaveBeenCalledWith(first.id)
  },
}

/**
 * No `onDelete`: the row draws no bin, rather than one that does nothing.
 *
 * A bespoke `render` rather than an `args` override - `exactOptionalPropertyTypes`
 * refuses `{ onDelete: undefined }` against a prop typed without `| undefined`,
 * so the door is left off the props object instead of set to nothing.
 */
export const ReadOnly: Story = {
  name: 'Read-only, no delete door',
  render: () => <ReportIndexPane reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onOpen={() => undefined} />,
}

/** A case that has produced nothing yet. */
export const Empty: Story = {
  name: 'A case with no reports',
  args: { reports: [], blocks: [] },
}

/**
 * Every written section blank, which is what a case looks like the moment a
 * layout is seeded.
 *
 * The outstanding line names every report rather than one, which is the state
 * that tells you the seeding worked and the writing has not started.
 */
export const NothingWritten: Story = {
  name: 'Nothing written yet',
  args: { blocks: DEMO_BLOCKS.map((block) => ({ ...block, hasProse: false })) },
}

/**
 * Every report sent, so none of them owes anything.
 *
 * A frozen report owes nothing whatever is in it: the document left, and naming
 * a gap there is an instruction to do something the app refuses.
 */
export const AllSent: Story = {
  name: 'Every report sent',
  args: {
    reports: DEMO_REPORTS.map((report) => ({
      ...report,
      status: 'final',
      sentAt: '2026-08-19T09:00:00.000Z',
    })),
  },
}

/** A 480px pane: the table keeps its floor and scrolls sideways in its wrapper. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[480px] border border-dashed border-border p-2">
      <ReportIndexPane {...args} />
    </div>
  ),
}

/**
 * A label past its column.
 *
 * The stage cannot be made long: it is a closed vocabulary of four, so the
 * label is the only string on this table an analyst controls the length of.
 */
export const Overlong: Story = {
  name: 'A label too long for its column',
  args: {
    reports: DEMO_REPORTS.map((report, at) =>
      at === 0
        ? {
            ...report,
            label:
              'Meridian Logistics root cause analysis and containment record, for the customer and their insurer',
            // From the registry, like everything else that names a stage.
            stage: DEMO_STAGES.at(-1) ?? null,
          }
        : report,
    ),
  },
}

/** Six rounds of the demo's four reports, which is a quarter of filing on one case. */
const ROUNDS = [0, 1, 2, 3, 4, 5]

/**
 * A case worked for a quarter: six rounds of the demo's four reports.
 *
 * The table is the whole of it here, so this is where the head has to stay put
 * and the outstanding line above it has to stay one sentence rather than a
 * list of two dozen names.
 */
export const Dense: Story = {
  name: 'A case with two dozen reports',
  args: { reports: manyReports(), blocks: manyBlocks() },
  // A table that drew the first page and gave no way to the rest would look
  // the same as this one until the rows are counted.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = await canvas.findAllByRole('row')
    await expect(rows.length).toBeGreaterThan(DEMO_REPORTS.length)
  },
}

/** Six rounds over the demo's four reports, each round labelled by its number. */
function manyReports() {
  return ROUNDS.flatMap((round) =>
    DEMO_REPORTS.map((report) => ({
      ...report,
      id: `${report.id}-round-${String(round)}`,
      label: `${report.label} (round ${String(round + 1)})`,
    })),
  )
}

/** The same rounds' sections, so every row counts what it really holds. */
function manyBlocks() {
  return ROUNDS.flatMap((round) =>
    DEMO_REPORTS.flatMap((report) =>
      blocksOf(DEMO_BLOCKS, report.id).map((block) => ({
        ...block,
        id: `${block.id}-round-${String(round)}`,
        reportId: `${report.id}-round-${String(round)}`,
      })),
    ),
  )
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { DEMO_LAYOUTS, DEMO_TLP } from '@/components/blocks/report-layouts'

import { DEMO_BLOCKS, DEMO_REPORTS, blocksOf } from '@/components/blocks/report-shape'
import { campaignCase } from '@/fixtures/campaign'
import { inACase } from '@/fixtures/in-a-case'

import { ReportSectionScreen } from './report-section'

/**
 * The report section as an analyst meets it: the case's documents on the rail,
 * and the one that is open in the pane.
 *
 * **The rail carries the list and the pane carries the document.** Drawing the
 * reports as a pane inside the content area is the same list twice, and two
 * clicks further from the thing being read.
 */
const meta = {
  title: 'Screens/Report/Section',
  component: ReportSectionScreen,
  decorators: [inACase('report')],
  parameters: { layout: 'fullscreen' },
  args: {
    reports: DEMO_REPORTS,
    blocks: DEMO_BLOCKS,
    kase: campaignCase,
    layouts: DEMO_LAYOUTS,
    markings: DEMO_TLP,
  },
} satisfies Meta<typeof ReportSectionScreen>

export default meta
type Story = StoryObj<typeof meta>

const first = DEMO_REPORTS[0]
const second = DEMO_REPORTS[1]

/** The bare section: every report, and what each still owes. */
export const Index: Story = {
  name: 'The section, nothing open',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const subrail = await canvas.findByTestId('report-subrail')
    for (const report of DEMO_REPORTS) {
      await expect(within(subrail).getByText(report.label)).toBeVisible()
    }
    await expect(within(subrail).getByText('New report')).toBeVisible()
  },
}

/**
 * A report open from the rail.
 *
 * **The pane is the document, not a second list of the same four reports.** The
 * rail is where every other section is reached from, and a list drawn twice is
 * the arrangement the maintainer asked to be rid of.
 */
export const Open: Story = {
  name: 'A report open from the rail',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(first).toBeDefined()
    await expect(second).toBeDefined()
    if (first === undefined || second === undefined) return

    const subrail = await canvas.findByTestId('report-subrail')
    await userEvent.click(within(subrail).getByText(first.label))

    const pane = canvasElement.querySelector<HTMLElement>('[data-slot="pane-scroll"]')
    await expect(pane).not.toBeNull()
    if (pane === null) return
    await waitFor(async () => {
      await expect(within(pane).getByRole('heading', { name: first.label })).toBeVisible()
    })
    await expect(within(pane).queryByText(second.label)).toBeNull()
  },
}

/** The door that starts one, which is a rail row rather than a button on a list. */
export const StartingOne: Story = {
  name: 'Starting a report from the rail',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const subrail = await canvas.findByTestId('report-subrail')
    await userEvent.click(within(subrail).getByText('New report'))
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(async () => {
      await expect(body.getByRole('dialog', { name: 'New report' })).toBeVisible()
    })
  },
}

/**
 * A sent report, which says so on the rail.
 *
 * The mark is a bullet and the word carries the state: hollow against filled is
 * a key nothing on screen teaches.
 */
export const OneSent: Story = {
  name: 'One report already sent',
  args: {
    reports: DEMO_REPORTS.map((report, at) =>
      at === 0
        ? { ...report, status: 'final' as const, sentAt: '2026-08-19T09:00:00.000Z' }
        : report,
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const subrail = await canvas.findByTestId('report-subrail')
    await expect(within(subrail).getAllByText('Sent')).toHaveLength(1)
  },
}

/** A case that has produced nothing: the rail carries the door and no rows. */
export const NoReports: Story = {
  name: 'A case with no reports',
  args: { reports: [], blocks: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const subrail = await canvas.findByTestId('report-subrail')
    await expect(within(subrail).getByText('New report')).toBeVisible()
    await expect(within(subrail).getAllByRole('listitem')).toHaveLength(1)
  },
}

/**
 * An install with no regime.
 *
 * **What the flag does belongs to `Report new dialog`**, which has this story
 * too and drives the whole layout list from it. What the screen owes is the
 * pass-through: reading the install's setting and never reaching the dialog
 * with it is a silent regression, since the dialog would go on defaulting to
 * the regime being on.
 */
export const NoRegime: Story = {
  name: 'An install with no regime',
  args: { nis2Enabled: false },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await step('the door still opens', async () => {
      const subrail = await canvas.findByTestId('report-subrail')
      await userEvent.click(within(subrail).getByText('New report'))
      await waitFor(async () => {
        await expect(body.getByRole('dialog', { name: 'New report' })).toBeVisible()
      })
    })
    await step('and the setting reached it, so no filing is offered', async () => {
      // Scoped to the dialog: `body` is the whole document, and a report
      // already written from a filing layout carries that label on the list
      // behind it -- which is not the dialog offering it.
      const filing = DEMO_LAYOUTS.find((one) => one.nis2)
      await expect(filing).toBeDefined()
      const dialog = within(body.getByRole('dialog', { name: 'New report' }))
      await expect(dialog.queryByText(filing!.label)).toBeNull()
    })
  },
}

/** Opened straight onto a report, which is what a link into the section does. */
export const OpenedOnAReport: Story = {
  name: 'Opened on a report',
  args: { openId: DEMO_REPORTS[0]?.id ?? null, blocks: DEMO_BLOCKS },
}

/**
 * A label past the width a rail row has.
 *
 * The row truncates and keeps its state mark and its qualifier, because those
 * are what the row is scanned for; the tooltip carries the whole name.
 */
export const Overlong: Story = {
  name: 'A label too long for the rail',
  args: {
    reports: DEMO_REPORTS.map((report, at) =>
      at === 0
        ? {
            ...report,
            label:
              'Meridian Logistics root cause analysis and containment record, for the customer and their insurer',
          }
        : report,
    ),
  },
}

/** Six rounds of the demo's four reports, which is a quarter of filing on one case. */
const ROUNDS = [0, 1, 2, 3, 4, 5]

/**
 * Two dozen reports on the rail, which is a case that has been filed on for a
 * quarter.
 *
 * The rail scrolls under its own header and the door that starts a report stays
 * reachable, rather than being pushed off the end of the list.
 */
export const Dense: Story = {
  name: 'A rail of two dozen reports',
  args: { reports: manyReports(), blocks: manyBlocks() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const subrail = await canvas.findByTestId('report-subrail')
    await expect(within(subrail).getAllByRole('listitem').length).toBeGreaterThan(
      DEMO_REPORTS.length,
    )
    await expect(within(subrail).getByText('New report')).toBeVisible()
  },
}

function manyReports() {
  return ROUNDS.flatMap((round) =>
    DEMO_REPORTS.map((report) => ({
      ...report,
      id: `${report.id}-round-${String(round)}`,
      label: `${report.label} (round ${String(round + 1)})`,
    })),
  )
}

/** The same rounds' sections, so every row says what it really owes. */
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

/**
 * A section added to the document that is open, not to the first of the case.
 *
 * A block is written under a `reportId`, and every report of the demo draws
 * the same twenty-two kinds - so a screen handing over the wrong id renders
 * identically and files the section in the wrong document. The kind that
 * leaves is the registry's key rather than the words on the row, for the same
 * reason it is elsewhere.
 *
 * **This lives here rather than in a unit test**: the kit's menu does not open
 * under jsdom, so a test pressing a kind there would assert nothing.
 */
export const AddingASection: Story = {
  name: 'A section added to the open report',
  args: { onAddSection: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(second).toBeDefined()
    if (second === undefined) return

    const subrail = await canvas.findByTestId('report-subrail')
    await userEvent.click(within(subrail).getByText(second.label))
    await userEvent.click(await canvas.findByRole('button', { name: 'Add section' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Kill chain coverage' }))

    await expect(args.onAddSection).toHaveBeenCalledWith(second.id, 'killchain')
  },
}

/**
 * The open document rearranged from the keyboard, and the order that leaves.
 *
 * Tab reaches a section's grip, Enter lifts it, the arrow keys walk the gaps
 * React Aria names, and Enter drops it. What the screen hands its caller is
 * the whole of that report's block ids in the order dropped - the body
 * `POST /cases/:id/report_blocks/order` takes.
 *
 * **The rows do not move here, and that is the screen being honest.** The
 * screen is handed a table and reports an order; it is the container's
 * optimistic cache that puts the sections back in the new places. A screen
 * that rearranged its own copy would show a move the case never took.
 */
export const RearrangingSections: Story = {
  name: 'Sections rearranged from the keyboard',
  args: { onReorder: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(second).toBeDefined()
    if (second === undefined) return

    const subrail = await canvas.findByTestId('report-subrail')
    await userEvent.click(within(subrail).getByText(second.label))

    const own = blocksOf(DEMO_BLOCKS, second.id)
    const [moved] = own
    await expect(moved).toBeDefined()
    if (moved === undefined) return

    const grips = await canvas.findAllByRole('button', { name: /^Drag / })
    await expect(grips).toHaveLength(own.length)
    grips[0]?.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(async () => {
      await expect(document.activeElement?.getAttribute('aria-label') ?? '').toMatch(/^Insert /)
    })
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')

    const before = own.map((block) => block.id)
    await waitFor(async () => {
      await expect(args.onReorder).toHaveBeenCalledWith([before[1], before[0], ...before.slice(2)])
    })
  },
}

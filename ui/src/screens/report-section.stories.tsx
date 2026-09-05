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
    // One row per report, and the door that starts one.
    for (const report of DEMO_REPORTS) {
      await expect(within(subrail).getByText(report.label)).toBeVisible()
    }
    await expect(within(subrail).getByText('New report')).toBeVisible()
  },
}

/**
 * A report open from the rail.
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
    // The other reports are on the rail and nowhere else.
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
 */
export const Dense: Story = {
  name: 'A rail of two dozen reports',
  args: { reports: manyReports(), blocks: manyBlocks() },
  // The door that starts a report is the row a long rail pushes off the end.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const subrail = await canvas.findByTestId('report-subrail')
    await expect(within(subrail).getAllByRole('listitem').length).toBeGreaterThan(
      DEMO_REPORTS.length,
    )
    await expect(within(subrail).getByText('New report')).toBeVisible()
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

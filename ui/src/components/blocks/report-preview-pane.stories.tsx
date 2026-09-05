import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { DEMO_BLOCKS, DEMO_PROSE, blocksOf, demoReport } from '@/components/blocks/report-shape'
import { campaignCase } from '@/fixtures/campaign'

import { ReportPreviewPane } from './report-preview-pane'

/**
 * The document that leaves, and it is two different things: the rendered file
 * on a live report is bytes this tier has not got, and a sent report previews
 * its own frozen copy.
 */
const meta = {
  title: 'Blocks/Report/Preview pane',
  component: ReportPreviewPane,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ReportPreviewPane>

export default meta
type Story = StoryObj<typeof meta>

const report = demoReport(0)
const blocks = blocksOf(DEMO_BLOCKS, report.id)

/** A live report: the rendered file is not drawn here, and says so. */
export const Live: Story = {
  args: { report, blocks, kase: campaignCase, live: DEMO_PROSE },
}

/** A sent report: its own frozen copy, as it stood when it left. */
export const Sent: Story = {
  args: {
    report: { ...report, status: 'final', sentAt: '2026-08-19T09:00:00.000Z' },
    blocks,
    kase: campaignCase,
    live: DEMO_PROSE,
  },
}

/** No sections: the export would produce a cover page and nothing else. */
export const NoSections: Story = {
  args: { report, blocks: [], kase: campaignCase, live: {} },
}

/**
 * A sent report of sixty sections.
 */
export const ManySections: Story = {
  name: 'Sixty sections in the sent copy',
  args: {
    report: { ...report, status: 'final', sentAt: '2026-08-19T09:00:00.000Z' },
    blocks: Array.from({ length: 60 }, (_, at) => ({
      ...blocks[0]!,
      id: `bulk-${String(at)}`,
      position: 1000 + at,
      // `heading`, not `title`: `headingOf` reads that first and falls back to
      // the block kind's label, so sixty titles would draw sixty sections all
      // called the same thing.
      heading: `Section ${String(at + 1)}`,
    })),
    kase: campaignCase,
    live: DEMO_PROSE,
  },
  play: async ({ canvas, step }) => {
    await step('the last section is drawn, and numbered from the whole list', async () => {
      await expect(canvas.getByRole('heading', { name: 'Section 60' })).toBeVisible()
      await expect(canvas.getByText('60')).toBeVisible()
    })
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { DEMO_BLOCKS, DEMO_PROSE, blocksOf, demoReport } from '@/components/blocks/report-shape'
import { DEMO_TLP } from '@/components/blocks/report-layouts'
import { campaignCase } from '@/fixtures/campaign'

import { ReportPaperPage } from './report-paper-page'

/**
 * The document at print size, painted from what is being typed.
 *
 * Not Preview: this paints the paragraph as you write it, where Preview is
 * the bytes that leave and cannot change until the server renders again.
 */
const meta = {
  title: 'Blocks/Report/Paper page',
  component: ReportPaperPage,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ReportPaperPage>

export default meta
type Story = StoryObj<typeof meta>

const report = demoReport(0)
const blocks = blocksOf(DEMO_BLOCKS, report.id)

/** A report part-written: written sections carry prose, generated ones a note. */
export const PartWritten: Story = {
  args: { blocks, live: DEMO_PROSE, kase: campaignCase, report, here: '' },
}

/** A marking on the page, drawn in its own black banner. */
export const Marked: Story = {
  args: {
    blocks,
    live: DEMO_PROSE,
    kase: campaignCase,
    report: { ...report, tlp: DEMO_TLP[2] ?? null },
    here: '',
  },
}

/**
 * Sixty sections on the page.
 *
 * The page is scrolled by the pane beside it rather than by itself, so it is
 * the whole document at every moment - there is no page to turn and nothing
 * that would draw a first screenful and stop. The section number is padded to
 * two figures, which is a width and not a limit.
 */
export const ManySections: Story = {
  name: 'Sixty sections on the page',
  args: {
    blocks: Array.from({ length: 60 }, (_, at) => ({
      ...blocks[0]!,
      id: `bulk-${String(at)}`,
      position: 1000 + at,
      // `heading`, not `title`: `headingOf` reads that first and falls back to
      // the block kind's label, so sixty titles would draw sixty sections all
      // called the same thing.
      heading: `Section ${String(at + 1)}`,
    })),
    live: DEMO_PROSE,
    kase: campaignCase,
    report,
    here: '',
  },
  play: async ({ canvas, step }) => {
    await step('the last section is on the page, numbered from the whole list', async () => {
      await expect(canvas.getByRole('heading', { name: /Section 60/ })).toBeVisible()
      await expect(canvas.getByText('60')).toBeVisible()
    })
    await step('the pad is a width rather than a limit', async () => {
      // Nine pads to `09`; ten does not become `10` by losing a figure.
      await expect(canvas.getByText('09')).toBeVisible()
    })
  },
}

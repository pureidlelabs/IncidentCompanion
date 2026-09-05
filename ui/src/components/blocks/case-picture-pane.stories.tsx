import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'

import { CasePicturePane } from './case-picture-pane'

/**
 * Where the case stands.
 */
const meta = {
  title: 'Blocks/List/Case picture',
  component: CasePicturePane,
  parameters: { layout: 'padded' },
  args: { kase: campaignCase, specs: specsFixture, record: campaignCompliance },
} satisfies Meta<typeof CasePicturePane>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The campaign demo: no awareness stamp, so the GDPR clock has not started.
 */
export const Populated: Story = {
  name: 'Clocks unstarted, work outstanding',
  // The queue is the pane. A build that returns nothing renders a clean page
  // with an encouraging sentence, which is indistinguishable from a finished
  // case until the rows are counted.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const queue = await canvas.findByRole('region', { name: 'Open items' })
    await expect(within(queue).getAllByRole('listitem').length).toBeGreaterThan(0)
  },
}

/** Awareness recorded nine hours ago: the clock runs and nothing is late. */
export const ClockRunning: Story = {
  name: 'The GDPR clock running',
  args: { record: { ...campaignCompliance, gdprAwareAt: '2026-08-19T00:00:00.000Z' } },
}

/**
 * Past 72 hours with no notification recorded.
 */
export const Overdue: Story = {
  name: 'Past the 72 hours',
  args: { record: { ...campaignCompliance, gdprAwareAt: '2026-08-14T00:00:00.000Z' } },
  play: async ({ canvasElement }) => {
    const late = canvasElement.querySelector('[data-slot="clock"][data-danger="true"]')
    await expect(late).not.toBeNull()
  },
}

/** Nothing this pane can see is outstanding. The words say exactly that. */
export const Clear: Story = {
  name: 'Nothing outstanding',
  args: { kase: complete() },
}

/** A door with somewhere to go, so the queue's controls are live. */
export const Doors: Story = {
  name: 'Doors that lead somewhere',
  args: { onOpen: () => undefined },
}

/** A 420px pane: the clock strip stacks and the queue rows keep their doors. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <CasePicturePane {...args} />
    </div>
  ),
}

/** Every event carrying every expected field, on a titled and detected case. */
function complete(): Case {
  return {
    ...campaignCase,
    detectedAt: '2026-08-13T16:16:41.775Z',
    timeline: campaignCase.timeline.map((entry) =>
      entry.kind === 'event'
        ? {
            ...entry,
            severity: entry.severity || 'medium',
            tactic: entry.tactic || 'execution',
            technique: entry.technique || 'T1059',
            eventSource: entry.eventSource || 'endpoint edr',
            confidence: entry.confidence || 'medium',
            sourceTool: entry.sourceTool || 'EDR console',
            systemId: entry.systemId ?? campaignCase.systems[0]?.id ?? '',
            accountIds:
              entry.accountIds.length > 0 ? entry.accountIds : [campaignCase.accounts[0]?.id ?? ''],
            timeAssumed: false,
            unreviewed: false,
          }
        : { ...entry, unreviewed: false },
    ),
  }
}

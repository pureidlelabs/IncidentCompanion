import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import type { TimelineEntry } from '@/api/model'
import {
  TimelineEntryRow,
  TimelineGapMark,
  type TimelineRunLike,
} from './timeline-entry-row'

const NAMES = {
  system: new Map([['s1', 'WKS-FINANCE01']]),
  account: new Map([['a1', 'j.okafor']]),
}

const EVENT: TimelineEntry = {
  id: 'e1',
  kind: 'event',
  time: '2026-08-24T09:14:00Z',
  timeAssumed: false,
  description: 'Ransomware deployment detected',
  severity: 'High',
  ukcPhase: 'Impact',
  technique: 'T1486',
  tactic: 'Impact',
  eventSource: 'EDR',
  systemId: 's1',
  sourceSystemId: '',
  accountIds: ['a1'],
  tags: 'ransomware,contained',
  author: 'j.okafor',
} as unknown as TimelineEntry

const ACTION: TimelineEntry = {
  id: 'a1',
  kind: 'action',
  time: '2026-08-24T09:30:00Z',
  timeAssumed: false,
  description: 'Isolated the host from the network',
  actionType: 'containment',
  systemId: 's1',
  sourceSystemId: '',
  accountIds: [],
  tags: '',
  author: 'j.okafor',
} as unknown as TimelineEntry

const RUN: TimelineRunLike = { lead: EVENT, members: [EVENT, EVENT, EVENT] }

/**
 * `TimelineEntryRow` on the React Aria kit: an event, an activity, a folded
 * run, and the gap that marks a stretch with nothing recorded.
 */
const meta = {
  title: 'Screens/Table/Timeline entry row',
  component: TimelineEntryRow,
  parameters: { layout: 'padded' },
  args: {
    run: { lead: EVENT, members: [EVENT] },
    names: NAMES,
  },
} satisfies Meta<typeof TimelineEntryRow>

export default meta
type Story = StoryObj<typeof meta>

/**
 * One event: what happened, when, and the rail that says what kind of thing it
 * is.
 */
export const AnEvent: Story = {
  name: 'An event',
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="timeline-row"]')).toHaveLength(1)
    await expect(canvasElement.querySelector('[data-slot="timeline-rail"]')).not.toBeNull()
    // Nothing to unfold, so nothing offers to.
    await expect(within(canvasElement).queryByRole('button', { name: /more/i })).toBeNull()
  },
  render: (args) => (
    <ol className="rounded-sm border border-border">
      <TimelineEntryRow {...args} />
    </ol>
  ),
}

/**
 * An activity rather than an event: the same row, a different rail.
 */
export const AnActivity: Story = {
  name: 'An activity',
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="timeline-rail"]')).not.toBeNull()
  },
  args: { run: { lead: ACTION, members: [ACTION] } },
  render: (args) => (
    <ol className="rounded-sm border border-border">
      <TimelineEntryRow {...args} />
    </ol>
  ),
}

/**
 * The head of a run: one row standing for three, with the count and the span
 * they cover.
 */
export const AFoldedRun: Story = {
  name: 'The head of a run of three',
  play: async ({ canvasElement, args }) => {
    // The count says how many are behind the fold.
    await expect(canvasElement.textContent).toContain(String(args.run.members.length))
  },
  args: { run: RUN },
  render: (args) => (
    <ol className="rounded-sm border border-border">
      <TimelineEntryRow {...args} onToggle={() => undefined} />
    </ol>
  ),
}

/**
 * A stretch with nothing recorded, marked rather than left as blank space.
 */
export const GapMark: Story = {
  name: 'A gap with nothing recorded',
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="timeline-gap"]')).not.toBeNull()
    await expect(canvas.getByText(/with nothing recorded/)).toBeVisible()
  },
  render: () => (
    <ol className="rounded-sm border border-border">
      <TimelineGapMark span={3 * 3600 * 1000} />
    </ol>
  ),
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import type { TimelineEntry } from '@/api/model'
import { BLANK_ACTION, BLANK_EVENT } from './timeline-entries'
import {
  TimelineEntryRow,
  TimelineGapMark,
  type TimelineRunLike,
} from './timeline-entry-row'

const NAMES = {
  system: new Map([['s1', 'WKS-FINANCE01']]),
  account: new Map([['a1', 'j.okafor']]),
}

// **Spread from the blank entry rather than cast past the type.** A literal
// naming the dozen fields a story cares about is not a `TimelineEntry`, and
// `as unknown as` made the compiler agree it was -- so a row reading any other
// field read `undefined` from a fixture that typechecked.
const EVENT: TimelineEntry = {
  ...BLANK_EVENT,
  id: 'e1',
  time: '2026-08-24T09:14:00Z',
  description: 'Ransomware deployment detected',
  severity: 'high',
  ukcPhase: 'Impact',
  technique: 'T1486',
  tactic: 'impact',
  eventSource: 'endpoint edr',
  systemId: 's1',
  accountIds: ['a1'],
  tags: 'ransomware,contained',
  author: 'j.okafor',
}

const ACTION: TimelineEntry = {
  ...BLANK_ACTION,
  id: 'a1',
  time: '2026-08-24T09:30:00Z',
  description: 'Isolated the host from the network',
  actionType: 'containment action',
  systemId: 's1',
  author: 'j.okafor',
}

/**
 * The same event as it arrives from a platform, which is what marks the row.
 *
 * Built from the blank rather than spread from `EVENT`: spreading one arm of
 * the event/activity union widens it back to the union, and the row's own
 * fields are what this story is about.
 */
const IMPORTED: TimelineEntry = {
  ...BLANK_EVENT,
  id: 'e2',
  time: '2026-08-24T09:14:00Z',
  description: 'Ransomware deployment detected',
  severity: 'high',
  ukcPhase: 'Impact',
  technique: 'T1486',
  tactic: 'impact',
  eventSource: 'endpoint edr',
  systemId: 's1',
  accountIds: ['a1'],
  author: 'j.okafor',
  provenance: 'imported',
  unreviewed: true,
  sourceTool: 'Microsoft Sentinel',
}

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
 *
 * A run of one draws no count and no fold, so a lone event reads as an event
 * rather than as a collapsed group of one.
 */
export const AnEvent: Story = {
  name: 'An event',
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-part="timeline-row"]')).toHaveLength(1)
    await expect(canvasElement.querySelector('[data-part="timeline-rail"]')).not.toBeNull()
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
 *
 * The rail is what separates what the attacker did from what an analyst did,
 * which is the distinction a timeline is read for.
 */
export const AnActivity: Story = {
  name: 'An activity',
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-part="timeline-rail"]')).not.toBeNull()
  },
  args: { run: { lead: ACTION, members: [ACTION] } },
  render: (args) => (
    <ol className="rounded-sm border border-border">
      <TimelineEntryRow {...args} />
    </ol>
  ),
}

/**
 * An entry that arrived from a platform rather than being typed.
 *
 * The marker is the row's quietest fact and sits with the derived ones, which
 * is what the screen's own rule asks for: nothing load-bearing behind a
 * disclosure, and provenance is what may recede. A row an analyst typed draws
 * no marker at all, which is every other story here.
 */
export const Imported: Story = {
  name: 'Imported from a platform',
  play: async ({ canvasElement }) => {
    const marker = canvasElement.querySelector('[data-part="timeline-origin"]')
    await expect(marker).not.toBeNull()
    await expect(marker?.textContent).toContain('Microsoft Sentinel')
  },
  args: { run: { lead: IMPORTED, members: [IMPORTED] } },
  render: (args) => (
    <ol className="rounded-sm border border-border">
      <TimelineEntryRow {...args} />
    </ol>
  ),
}

/**
 * The head of a run: one row standing for three, with the count and the span
 * they cover.
 *
 * A burst of near-identical entries is one line an analyst can open, rather
 * than three lines they have to read past.
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
 *
 * Silence in a timeline is a finding: three hours with no entry is either
 * nothing happening or nothing being collected, and an unmarked gap reads as
 * neither.
 */
export const GapMark: Story = {
  name: 'A gap with nothing recorded',
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector('[data-part="timeline-gap"]')).not.toBeNull()
    await expect(canvas.getByText(/with nothing recorded/)).toBeVisible()
  },
  render: () => (
    <ol className="rounded-sm border border-border">
      <TimelineGapMark span={3 * 3600 * 1000} />
    </ol>
  ),
}

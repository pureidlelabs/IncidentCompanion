import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@/components/ui/timeline'

const EVENTS = [
  {
    at: '2026-08-19T08:14:00Z',
    shown: '19 Aug, 08:14',
    title: 'Initial access',
    detail: 'A password-spray against the VPN gateway succeeded on one account.',
  },
  {
    at: '2026-08-19T08:41:00Z',
    shown: '19 Aug, 08:41',
    title: 'Persistence',
    detail: 'An inbox rule was created forwarding to an external address.',
  },
  {
    at: '2026-08-19T11:02:00Z',
    shown: '19 Aug, 11:02',
    title: 'Collection',
    detail: 'The mailbox was read in bulk through the Graph API.',
  },
  {
    at: '2026-08-19T13:20:00Z',
    shown: '19 Aug, 13:20',
    title: 'Containment',
    detail: 'The session was revoked and the rule removed.',
  },
]

function Events() {
  return EVENTS.map((event, at) => (
    <TimelineItem key={event.title} step={at + 1}>
      <TimelineHeader>
        <TimelineIndicator />
        <TimelineSeparator />
        <TimelineDate dateTime={event.at}>{event.shown}</TimelineDate>
        <TimelineTitle>{event.title}</TimelineTitle>
      </TimelineHeader>
      <TimelineContent>{event.detail}</TimelineContent>
    </TimelineItem>
  ))
}

/**
 * `Timeline` at three points in a run, and on both axes.
 */
const meta = {
  title: 'Components/Timeline',
  component: Timeline,
  parameters: { layout: 'padded' },
  args: { children: null },
} satisfies Meta<typeof Timeline>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The state that matters: a run part-way through, where the boundary between
 * what is done and what is not has to be readable at a glance.
 */
export const PartlyComplete: Story = {
  name: 'Two of four done',
  render: () => (
    <Timeline value={2} className="max-w-lg pl-8">
      <Events />
    </Timeline>
  ),
  play: async ({ canvasElement, step }) => {
    const items = [...canvasElement.querySelectorAll('[data-slot="timeline-item"]')]
    const markOf = (item: Element) =>
      getComputedStyle(item.querySelector('[data-slot="timeline-indicator"]')!).borderTopColor
    const lineOf = (item: Element) =>
      getComputedStyle(item.querySelector('[data-slot="timeline-separator"]')!).backgroundColor

    await step('The first two are marked done and the rest are not', async () => {
      await expect(items.map((item) => item.hasAttribute('data-completed'))).toEqual([
        true,
        true,
        false,
        false,
      ])
    })

    await step('And the marks and lines read the flag off their item', async () => {
      await expect(markOf(items[0]!)).toBe(markOf(items[1]!))
      await expect(markOf(items[1]!)).not.toBe(markOf(items[2]!))
      await expect(lineOf(items[1]!)).not.toBe(lineOf(items[2]!))
    })

    await step('The mark sits on the line it interrupts', async () => {
      const centre = (element: Element) => {
        const box = element.getBoundingClientRect()
        return box.left + box.width / 2
      }
      await expect(
        centre(items[0]!.querySelector('[data-slot="timeline-indicator"]')!),
      ).toBeCloseTo(centre(items[0]!.querySelector('[data-slot="timeline-separator"]')!), 0)
    })
  },
}

/** `value={0}` marks nothing, which is a run that has not started. */
export const NoneComplete: Story = {
  name: 'Nothing done yet',
  render: () => (
    <Timeline value={0} className="max-w-lg pl-8">
      <Events />
    </Timeline>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelectorAll('[data-slot="timeline-item"][data-completed]'),
    ).toHaveLength(0)
  },
}

/**
 * Every step done.
 */
export const AllComplete: Story = {
  name: 'The whole run done',
  render: () => (
    <Timeline value={EVENTS.length} className="max-w-lg pl-8">
      <Events />
    </Timeline>
  ),
  play: async ({ canvasElement }) => {
    const items = canvasElement.querySelectorAll('[data-slot="timeline-item"]')

    await expect(
      canvasElement.querySelectorAll('[data-slot="timeline-item"][data-completed]'),
    ).toHaveLength(items.length)
  },
}

/**
 * The same markup on the other axis.
 */
export const Horizontal: Story = {
  render: () => (
    <Timeline value={2} orientation="horizontal" className="pt-8">
      <Events />
    </Timeline>
  ),
  play: async ({ canvasElement, step }) => {
    const boxes = [...canvasElement.querySelectorAll('[data-slot="timeline-item"]')].map(
      (item) => item.getBoundingClientRect(),
    )

    await step('The run goes across rather than down', async () => {
      await expect(boxes[1]!.left).toBeGreaterThan(boxes[0]!.left)
      await expect(boxes[1]!.top).toBeCloseTo(boxes[0]!.top, 0)
    })

    await step('And the line lies along it', async () => {
      const line = canvasElement
        .querySelector('[data-slot="timeline-separator"]')!
        .getBoundingClientRect()
      await expect(line.width).toBeGreaterThan(line.height)
    })
  },
}

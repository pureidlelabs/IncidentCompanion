import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { campaignCase } from '@/fixtures/campaign'
import { msOf } from '@/lib/case-time'

import { TimelineGraphScreen } from './timeline-graph'
import { EMPTY_CAMPAIGN } from './timeline-entries'
import { inACase } from '@/fixtures/in-a-case'

/**
 * The case against its own clock.
 *
 * Every story mounts in a box with a height: the cascade fills and scrolls
 * inside it, and without one the silence bands and the metrics band both run
 * off the page.
 */
const meta = {
  title: 'Screens/Correlate/Timeline graph',
  component: TimelineGraphScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [inACase('timeline-graph')],
  args: { kase: campaignCase },
} satisfies Meta<typeof TimelineGraphScreen>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The campaign over two days, with both tracks carrying runs.
 *
 * The demo folds to 21 runs, 16 observed against 5 response, so the right half
 * is populated from the fixture rather than from anything invented for the
 * picture. `detectedAt` is `null` on every demo the app ships, so the two
 * elapsed figures read `not recorded` rather than zero - the state most cases
 * open in, and the one the strip has to read well in.
 */
export const Populated: Story = {
  name: 'Both tracks, undated',
  play: async ({ canvasElement }) => {
    // The half that read as dead. A drawing reserving a lane for a track
    // the case does have, and never filling it, is the defect.
    await expect(canvasElement.querySelectorAll('[data-track="observed"]').length)
      .toBeGreaterThan(0)
    await expect(canvasElement.querySelectorAll('[data-track="response"]').length)
      .toBeGreaterThan(0)
  },
}

/**
 * The stage stamps recorded, so both elapsed figures resolve.
 *
 * Dwell is first activity to detection and time-to-contain is detection to
 * containment: two different questions off three different stamps.
 */
export const Dated: Story = {
  name: 'Detection and containment recorded',
  args: { kase: dated() },
  // The two figures are the band's whole claim, and a metric that silently
  // falls back to `not recorded` renders identically to one nobody wired up.
  play: async ({ canvasElement }) => {
    const dwell = canvasElement.querySelector('[data-slot="metric-dwell"]')
    const contain = canvasElement.querySelector('[data-slot="metric-contain"]')
    await expect(dwell?.textContent).not.toBe('not recorded')
    await expect(contain?.textContent).not.toBe('not recorded')
    // And the stamps are rules across the spine, which is what makes the two
    // figures above legible as distances rather than as arithmetic.
    await expect(canvasElement.querySelectorAll('[data-slot="cascade-milestone"]'))
      .toHaveLength(4)
  },
}

/**
 * Two days deleted from the middle, which is what a long silence looks like.
 *
 * The band is square-rooted against the longest gap on the case, so it stays
 * a band rather than pushing everything after it off the screen.
 */
export const LongSilence: Story = {
  name: 'A long silence, to scale',
  args: { kase: withHole() },
  play: async ({ canvasElement }) => {
    const bands = canvasElement.querySelectorAll('[data-slot="cascade-gap"]')
    await expect(bands.length).toBeGreaterThan(0)
    const tallest = Math.max(
      ...[...bands].map((band) => Number.parseInt((band as HTMLElement).style.height, 10)),
    )
    await expect(tallest).toBeGreaterThan(26)
    await expect(tallest).toBeLessThanOrEqual(150)
  },
}

/** Only what the SOC did, which puts every card on the response track. */
export const ResponseOnly: Story = {
  name: 'Only the response track',
  args: {
    kase: {
      ...campaignCase,
      timeline: campaignCase.timeline.filter((entry) => entry.kind === 'action'),
    },
  },
}

/**
 * One entry, which is what a case looks like in its first minute.
 *
 * No silence, no second moment, and so no elapsed distance to draw - the spine
 * still has to read as a spine.
 */
export const SingleEntry: Story = {
  name: 'A single entry',
  args: {
    kase: { ...campaignCase, timeline: campaignCase.timeline.slice(0, 1) },
  },
}

/** Nothing to draw. The words send the analyst to where entries are made. */
export const Empty: Story = {
  play: async ({ canvas, step }) => {
    await step('the words send the analyst where entries are made', async () => {
      // This screen draws what the Timeline records, so an empty one is not a
      // place to act -- it names the screen that is.
      await expect(canvas.getByText('No timeline activity yet')).toBeVisible()
      await expect(canvas.getByText(/from the Timeline/)).toBeVisible()
    })
  },
  name: 'Nothing recorded yet',
  args: { kase: EMPTY_CAMPAIGN },
}

/** A 520px pane: both tracks narrow, the cards fill them, and the spine stays
 *  centred because the clock column is a fixed width. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="flex min-h-0 w-[520px] flex-1 flex-col border border-dashed border-border p-2">
      <TimelineGraphScreen {...args} />
    </div>
  ),
}

/** A run label past its track, which wraps inside the measure rather than
 *  widening the lane. One uncapped card set the rhythm for the whole page. */
export const Overlong: Story = {
  name: 'A label too long for its track',
  args: {
    kase: {
      ...campaignCase,
      timeline: campaignCase.timeline.map((entry, at) =>
        at === 0
          ? {
              ...entry,
              description:
                'Macro-enabled attachment opened on nine finance mailboxes, dropping a signed loader that beaconed within four minutes',
            }
          : entry,
      ),
    },
  },
}

/**
 * A month of a case that stayed open: the campaign's week, four times over.
 *
 * The cascade has to stay readable once the runs outnumber the height it has,
 * so this is where the scroller inside the box is judged rather than the shape
 * of any one run.
 */
export const Dense: Story = {
  name: 'A month of entries',
  args: { kase: manyWeeks() },
  // A cascade that drew the first screenful and stopped renders the same
  // picture as one holding the whole month.
  play: async ({ canvasElement }) => {
    const runs = canvasElement.querySelectorAll('[data-track="observed"]')
    await expect(runs.length).toBeGreaterThan(10)
  },
}

/** The campaign with the four stage stamps an analyst would record. */
function dated() {
  return {
    ...campaignCase,
    detectedAt: '2026-08-13T16:16:41.775Z',
    containedAt: '2026-08-16T09:40:00.000Z',
    eradicatedAt: '2026-08-17T14:05:00.000Z',
    recoveredAt: '2026-08-19T08:00:00.000Z',
  }
}

/** The campaign with its two middle days deleted. */
function withHole() {
  const stamps = campaignCase.timeline
    .map((entry) => msOf(entry.time))
    .filter((at): at is number => at !== null)
  const first = Math.min(...stamps)
  const day = 24 * 60 * 60 * 1000
  return {
    ...campaignCase,
    timeline: campaignCase.timeline.filter((entry) => {
      const at = msOf(entry.time)
      if (at === null) return true
      const since = at - first
      return since < day || since > 3 * day
    }),
  }
}

/** The campaign's week repeated over four, each copy a week further on. */
function manyWeeks() {
  const week = 7 * 24 * 60 * 60 * 1000
  return {
    ...campaignCase,
    timeline: [0, 1, 2, 3].flatMap((step) =>
      campaignCase.timeline.map((entry) => {
        const at = msOf(entry.time)
        return {
          ...entry,
          id: `${entry.id}-week-${String(step)}`,
          time: at === null ? entry.time : new Date(at + step * week).toISOString(),
        }
      }),
    ),
  }
}

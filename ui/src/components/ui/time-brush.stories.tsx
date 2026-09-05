import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'

import { spanOf, type TimeWindow } from '@/lib/time-window'

import { TimeBrush } from './time-brush'

const HOUR = 60 * 60 * 1000
const START = Date.UTC(2026, 6, 25, 6, 0)

/**
 * The lopsided shape a real case has: a six-hour intrusion, twenty hours of
 * nothing, and one late notification.
 */
const CAMPAIGN: readonly number[] = [
  ...Array.from({ length: 60 }, (_, at) => START + at * 6 * 60 * 1000),
  ...Array.from({ length: 12 }, (_, at) => START + 4 * HOUR + at * 10 * 60 * 1000),
  START + 26 * HOUR,
]

const SPAN = spanOf(CAMPAIGN) ?? { from: START, to: START + HOUR }

/**
 * Narrowing a case by *when* rather than by field.
 *
 * The track is the case's own span, so it is full at every scale, and the
 * density behind it is where the entries actually are. A stretch of nothing
 * shows in the control rather than two screens down.
 */
const meta = {
  title: 'Components/TimeBrush',
  component: TimeBrush,
  parameters: { layout: 'padded' },
  // Every story below drives the control from its own state, so these are the
  // shape the args table documents rather than what any story renders.
  args: {
    times: CAMPAIGN,
    span: SPAN,
    value: null,
    onChange: () => undefined,
  },
} satisfies Meta<typeof TimeBrush>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The control holding its own window, which is what every caller does: the
 * screen owns the filter and hands it back down.
 */
function Brushed({
  times,
  span,
  window: initial = null,
  isDisabled = false,
}: {
  times: readonly number[]
  span: TimeWindow
  window?: TimeWindow | null
  isDisabled?: boolean
}) {
  const [window, setWindow] = useState<TimeWindow | null>(initial)
  const kept = times.filter(
    (at) => window === null || (at >= window.from && at <= window.to),
  ).length
  return (
    <div className="flex w-full max-w-content-max flex-col gap-2">
      <TimeBrush
        times={times}
        span={span}
        value={window}
        onChange={setWindow}
        isDisabled={isDisabled}
      />
      <p className="text-xs text-ink-muted">
        {window === null
          ? `${String(times.length)} entries, the whole case`
          : `${String(kept)} of ${String(times.length)} entries in the window`}
      </p>
    </div>
  )
}


/**
 * The track band and the two grips, as laid out.
 *
 * Rects rather than eyes: a marker one pixel proud of the band and one twelve
 * pixels proud look the same in a screenshot at this size, and the second was
 * the defect.
 */
function geometry(root: HTMLElement) {
  const track = root.querySelector('[data-slot="time-brush-track"]')
  const grips = [...root.querySelectorAll('[data-slot="time-brush-thumb"]')]
  if (!(track instanceof HTMLElement) || grips.length !== 2) {
    throw new Error('the brush drew no track, or not two grips')
  }
  const band = track.getBoundingClientRect()
  return {
    band,
    grips: grips.map((grip) => grip.getBoundingClientRect()),
  }
}

/** Where along the track a stamp sits, in client pixels. */
function xOf(band: DOMRect, at: number): number {
  return band.left + ((at - SPAN.from) / (SPAN.to - SPAN.from)) * band.width
}

/** No window: both grips at the ends, and nothing is narrowed. */
export const WholeCase: Story = {
  name: 'The whole case',
  render: () => <Brushed times={CAMPAIGN} span={SPAN} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('73 entries, the whole case')).toBeVisible()
    // The density is the claim the control's name makes, and a histogram that
    // drew nothing would still mount cleanly.
    const drawn = [...canvasElement.querySelectorAll('[data-slot="time-brush-density"] > span')]
    await expect(drawn.length).toBeGreaterThan(11)
    await expect(drawn.some((tick) => tick.getBoundingClientRect().height > 0)).toBe(true)

    // **The grips sit on the band, not proud of it.** React Aria positions a
    // thumb on the value axis alone, so the cross-axis centring is the kit's
    // to supply - and when it was missing both grips stood half their height
    // above the track.
    const { band, grips } = geometry(canvasElement)
    for (const grip of grips) {
      await expect(Math.abs((grip.top + grip.bottom) / 2 - (band.top + band.bottom) / 2))
        .toBeLessThanOrEqual(1)
      await expect(grip.height).toBeLessThanOrEqual(band.height)
    }

    // With no window the grips are the ends of the case.
    await expect(Math.abs((grips[0]?.left ?? 0) + (grips[0]?.width ?? 0) / 2 - band.left))
      .toBeLessThanOrEqual(1)
    await expect(Math.abs((grips[1]?.left ?? 0) + (grips[1]?.width ?? 0) / 2 - band.right))
      .toBeLessThanOrEqual(1)
  },
}

/** A window over the burst: the ring says where it is, the stamps say when. */
export const Narrowed: Story = {
  name: 'Narrowed to the burst',
  render: () => (
    <Brushed times={CAMPAIGN} span={SPAN} window={{ from: START, to: START + 3 * HOUR }} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/of 73 entries in the window/)).toBeVisible()

    // Each grip's horizontal centre is on the stamp it stands for, so the
    // window the analyst sees is the window the rows are filtered by.
    const { band, grips } = geometry(canvasElement)
    const wanted = [START, START + 3 * HOUR]
    for (const [index, grip] of grips.entries()) {
      const centre = grip.left + grip.width / 2
      await expect(Math.abs(centre - xOf(band, wanted[index] ?? START))).toBeLessThanOrEqual(1)
    }

    // **Hue carries the selection.** A tick inside the window is the accent
    // and one outside it is neutral, so the plot says which part of the case
    // is selected without a legend. Read off the painted colour rather than
    // the class, since the class is what a rewrite would change.
    //
    // Sampled a tick's width clear of the edge on either side: the component
    // classifies a slice by its own midpoint in *time*, so a tick straddling
    // the boundary is legitimately on either side and says nothing.
    const drawn = [...canvasElement.querySelectorAll('[data-slot="time-brush-density"] > span')]
      .map((node) => ({ node, box: node.getBoundingClientRect() }))
      .filter(({ box }) => box.height > 0)
    const edge = xOf(band, START + 3 * HOUR)
    const slack = drawn[0]?.box.width ?? 2
    const colourOf = (node: Element) => getComputedStyle(node).backgroundColor
    const inside = drawn.filter(({ box }) => box.right < edge - slack).map(({ node }) => colourOf(node))
    const outside = drawn.filter(({ box }) => box.left > edge + slack).map(({ node }) => colourOf(node))

    await expect(inside.length).toBeGreaterThan(2)
    await expect(outside.length).toBeGreaterThan(2)
    await expect(new Set(inside).size).toBe(1)
    await expect(new Set(outside).size).toBe(1)
    await expect(inside[0]).not.toBe(outside[0])
  },
}

/**
 * The window in the twenty hours with nothing in them.
 *
 * A brush that catches nothing is a finding rather than a fault, so the
 * control keeps its shape and the count says zero.
 */
export const NarrowedToNothing: Story = {
  name: 'Narrowed to nothing',
  render: () => (
    <Brushed
      times={CAMPAIGN}
      span={SPAN}
      window={{ from: START + 10 * HOUR, to: START + 20 * HOUR }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('0 of 73 entries in the window')).toBeVisible()
  },
}

/** A case with nothing recorded: a bare track, and no density to read. */
export const NoEntries: Story = {
  name: 'Nothing recorded',
  render: () => <Brushed times={[]} span={{ from: START, to: START + HOUR }} />,
}

/** One entry. Its span is widened to a minute, so there is something to grab. */
export const OneEntry: Story = {
  name: 'A single entry',
  render: () => {
    const times = [START]
    return <Brushed times={times} span={spanOf(times) ?? SPAN} />
  },
}

/**
 * Every entry inside one hour, which is what an import writes.
 *
 * The track is the case's own span, so it is full here too - the histogram
 * spreads over the hour rather than collapsing into one tick at the left.
 */
export const OneHour: Story = {
  name: 'A case an hour long',
  render: () => {
    const times = Array.from({ length: 40 }, (_, at) => START + at * 90 * 1000)
    return <Brushed times={times} span={spanOf(times) ?? SPAN} />
  },
}

/** Disabled: the grips are still focusable, and nothing moves. */
export const Disabled: Story = {
  render: () => <Brushed times={CAMPAIGN} span={SPAN} isDisabled />,
}
